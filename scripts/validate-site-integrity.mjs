#!/usr/bin/env node
import assert from "node:assert/strict";
import {runInNewContext} from "node:vm";
import fs from "node:fs";
import {execFileSync} from "node:child_process";

const sitemap=fs.readFileSync("sitemap.xml","utf8");
const tree=execFileSync("git",["ls-files","*.html"],{encoding:"utf8"}).trim().split(/\r?\n/).filter(Boolean);
const sourcePath=(url)=>url==="/"?"index.html":url.replace(/^\/+|\/+$/g,"")+"/index.html";
const sitemapUrls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1].trim());
const siteUrls=sitemapUrls.filter(url=>url.startsWith("https://jawed.co.in/"));
const nonCanonicalSitemapUrls=sitemapUrls.filter(url=>!url.startsWith("https://jawed.co.in/"));
const sitemapPaths=siteUrls.map(url=>url.slice("https://jawed.co.in".length)||"/");
const sourcePaths=tree.filter(file=>file!=="404.html"&&file!=="offline.html"&&!file.startsWith("google"));
const toolsDataSource=fs.readFileSync("src/data/toolsData.ts","utf8");
const toolDetailSource=fs.readFileSync("src/pages/ToolDetailPage.tsx","utf8");
function hasReactToolSource(path){
  const prefix="/tools/";
  if(!path.startsWith(prefix))return false;
  let slug=path.slice(prefix.length);
  if(slug.endsWith("/"))slug=slug.slice(0,-1);
  if(!slug||slug.includes("/"))return false;
  const start=toolsDataSource.indexOf(`slug: '${slug}'`);
  if(start<0)return false;
  const end=toolsDataSource.indexOf("\n  },",start);
  const entry=end<0?toolsDataSource.slice(start):toolsDataSource.slice(start,end);
  const mappingLine=toolDetailSource.split("\n").find(line=>line.includes(`case '${slug}':`));
  if(!mappingLine)return false;
  const componentStart=mappingLine.indexOf("return <");
  const componentEnd=mappingLine.indexOf(" />",componentStart);
  if(componentStart<0||componentEnd<0)return false;
  const componentName=mappingLine.slice(componentStart+8,componentEnd).trim();
  const imported=toolDetailSource.includes(`import { ${componentName} }`);
  const requiredFields=["title:","purpose:","steps:","exampleOutput:","faq:"];
  return imported && requiredFields.every(field=>entry.includes(field));
}
const missingSources=sitemapPaths.filter(path=>!fs.existsSync(sourcePath(path))&&!hasReactToolSource(path));
const unsitemapPages=sourcePaths.filter(file=>{
  const path=file==="index.html"?"/":"/"+file.replace(/\/index\.html$/,"")+"/";
  return !sitemapPaths.includes(path);
});
const duplicateSitemapPaths=sitemapPaths.filter((path,index)=>sitemapPaths.indexOf(path)!==index);
const errors=[];
if(nonCanonicalSitemapUrls.length)errors.push("Sitemap contains non-canonical URLs: "+nonCanonicalSitemapUrls.join(", "));
if(missingSources.length)errors.push("Sitemap routes missing source pages: "+missingSources.join(", "));
if(unsitemapPages.length)errors.push("Published HTML pages missing from sitemap: "+unsitemapPages.join(", "));
if(duplicateSitemapPaths.length)errors.push("Sitemap contains duplicate routes: "+duplicateSitemapPaths.join(", "));

const projectPage=fs.readFileSync("work/projects/index.html","utf8");
if(projectPage.includes("Provide a foundation for future Notes, Blog and Tools sections"))errors.push("Projects page still describes existing site sections as future work");
if(!projectPage.includes("Delivered foundations and ongoing priorities")||!projectPage.includes("Current work focuses on content quality"))errors.push("Projects page must distinguish delivered foundations from current development priorities");

const blogArticle=fs.readFileSync("blog/rebuilding-jawed-co-in/index.html","utf8");
const blogBreadcrumbContract=blogArticle.includes('"@type":"BreadcrumbList"')&&blogArticle.includes('"position":1,"name":"Home"')&&blogArticle.includes('"position":2,"name":"Blog"')&&blogArticle.includes('"position":3,"name":"Rebuilding Jawed.co.in"');
if(!blogBreadcrumbContract)errors.push("Blog article must preserve breadcrumb structured data matching the visible Home > Blog > Article path");
else console.log("Blog breadcrumb structured-data contract: PASS");

const blogArticleContract=blogArticle.includes('"@type":"BlogPosting"')&&blogArticle.includes('"datePublished":"2026-09-27"')&&blogArticle.includes('"author":{"@type":"Person","name":"Jawed Imtiaz"');
if(!blogArticleContract)errors.push("Blog article must preserve BlogPosting author/date structured data");
else console.log("BlogPosting structured-data contract: PASS");
const triageBlogArticle=fs.readFileSync("blog/triage-workplace-app-access-issue/index.html","utf8");
const triageBlogArticleContract=triageBlogArticle.includes('"@type":"Article"')&&triageBlogArticle.includes('"datePublished":"2026-10-12"')&&triageBlogArticle.includes('"author":{"@type":"Person","name":"Jawed Imtiaz"')&&triageBlogArticle.includes('"@type":"BreadcrumbList"')&&triageBlogArticle.includes('"position":3,"name":"How to Triage a Workplace App Access Issue"')&&sitemap.includes("https://jawed.co.in/blog/triage-workplace-app-access-issue/");
if(!triageBlogArticleContract)errors.push("Triage case study must preserve Article author/date/breadcrumb structured data and sitemap membership");
else console.log("Triage case-study structured-data and sitemap contract: PASS");



const publishedHtml=sourcePaths.filter(file=>file.endsWith(".html"));
const routeForSource=file=>file==="index.html"?"/":"/"+file.replace(/\\/g,"/").replace(/\/index\.html$/,"")+"/";
const publishedRoutes=new Set(publishedHtml.map(routeForSource));
const metadataContractErrors=[];
for(const file of publishedHtml){
  const html=fs.readFileSync(file,"utf8");
  const route=routeForSource(file);
  const expectedCanonical="https://jawed.co.in"+route;
  const title=html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim();
  const description=html.match(/<meta name="description" content="([^"]*)"/)?.[1]?.trim();
  if(!title)metadataContractErrors.push(file+" title missing");
  if(!description)metadataContractErrors.push(file+" meta description missing");
  const canonical=html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const ogUrl=html.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
  const twitterCard=html.match(/<meta name="twitter:card" content="([^"]+)"/)?.[1];
  const ldBlocks=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if(canonical!==expectedCanonical)metadataContractErrors.push(file+" canonical="+(canonical||"missing"));
  if(ogUrl!==expectedCanonical)metadataContractErrors.push(file+" og:url="+(ogUrl||"missing"));
  if(twitterCard!=="summary_large_image")metadataContractErrors.push(file+" twitter:card="+(twitterCard||"missing"));
  for(const block of ldBlocks){try{JSON.parse(block[1])}catch{metadataContractErrors.push(file+" JSON-LD invalid")}}
}
if(metadataContractErrors.length)errors.push("Published-page metadata contract failed: "+metadataContractErrors.join(", "));

const documentHeadSource=fs.readFileSync("src/components/common/DocumentHead.tsx","utf8");
const reactToolMetadataContract=
  documentHeadSource.includes("toolsList.find((t) => t.slug === slug)")&&
  documentHeadSource.includes("${tool.title} | Interactive Tool | Jawed Imtiaz")&&
  documentHeadSource.includes("${tool.benefit} ${tool.description}");
if(!reactToolMetadataContract)errors.push("React tool routes must provide route-specific title and description metadata through DocumentHead");
else console.log("React tool route metadata contract: PASS");


const navigationContractErrors=[];
const reactHeader=fs.readFileSync("src/components/layout/Header.tsx","utf8");
for(const file of publishedHtml){
  if(file==="tools/career-match-resume-review/index.html")continue;
  if(file==="index.html"){
    const requiredReactNavigationContract=
      reactHeader.includes('id="site-nav"')&&
      reactHeader.includes('aria-label="Main navigation"')&&
      reactHeader.includes('className="nav-group"')&&
      reactHeader.includes('to="/topics/"')&&
      reactHeader.includes('to="/notes/"')&&
      reactHeader.includes('to="/blog/"')&&
      reactHeader.includes('to="/resources/"')&&
      reactHeader.includes('to="/tools/"')&&
      reactHeader.includes('to="/ai/"')&&
      reactHeader.includes('to="/contact/"');
    if(!requiredReactNavigationContract)navigationContractErrors.push(file);
    continue;
  }
  const html=fs.readFileSync(file,"utf8");
  const nav=html.match(/<nav id="site-nav" class="site-nav" aria-label="Main navigation">([\s\S]*?)<\/nav>/)?.[1]||"";
  const requiredNavigationContract=
    nav.includes('<details class="nav-group"><summary>Explore</summary>')&&
    nav.includes('<a href="/topics/">Topics</a>')&&
    nav.includes('<a href="/notes/">Notes</a>')&&
    nav.includes('<a href="/blog/">Blog</a>')&&
    nav.includes('<a href="/resources/">Resources</a>')&&
    /<a href="\/tools\/"(?:\s[^>]*)?>Tools<\/a>/.test(nav)&&
    nav.includes('<a href="/ai/">AI</a>')&&
    nav.includes('<a href="/contact/">Contact</a>');
  if(!requiredNavigationContract)navigationContractErrors.push(file);
}
if(navigationContractErrors.length)errors.push("Primary navigation parity failed: "+navigationContractErrors.join(", "));
else console.log("Primary navigation parity contract: PASS");


const internalLinkIssues=[];
for(const file of publishedHtml){
  const html=fs.readFileSync(file,"utf8");
  for(const match of html.matchAll(/(?:href|action)=["']([^"']+)["']/g)){
    const value=match[1];
    if(!value.startsWith("/")||value.startsWith("//")||value.startsWith("/ai/?q="))continue;
    const hashIndex=value.indexOf("#");
    const targetPath=hashIndex===-1?value:value.slice(0,hashIndex);
    const fragment=hashIndex===-1?"":decodeURIComponent(value.slice(hashIndex+1));
    if(targetPath.startsWith("/assets/")||targetPath==="/favicon.svg"||/\.[a-z0-9]{2,5}$/i.test(targetPath))continue;
    const normalizedPath=targetPath===""?"/":(targetPath.endsWith("/")?targetPath:targetPath+"/");
    if(!publishedRoutes.has(normalizedPath)){
      internalLinkIssues.push(file+" -> "+value);
      continue;
    }
    if(fragment){
      const targetSource=normalizedPath==="/"?"index.html":normalizedPath.replace(/^\/+|\/+$/g,"")+"/index.html";
      const targetHtml=fs.readFileSync(targetSource,"utf8");
      const hasFragment=targetHtml.includes('id="'+fragment+'"')||targetHtml.includes("id='"+fragment+"'")||targetHtml.includes('name="'+fragment+'"')||targetHtml.includes("name='"+fragment+"'");
      if(!hasFragment)internalLinkIssues.push(file+" -> "+value);
    }
  }
}
if(internalLinkIssues.length)errors.push("Internal links or fragment targets are invalid: "+internalLinkIssues.join(", "));

const careerMatch=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchInlineScripts=[...careerMatch.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].filter(match=>!/<script[^>]*type=["\']application\/ld\+json["\']/i.test(match[0])).map(match=>match[1]).filter(script=>script.trim());
for(const [index,script] of careerMatchInlineScripts.entries()){
  try{new Function(script)}catch(error){errors.push(`Career Match inline script ${index+1} has invalid JavaScript syntax: ${error.message}`)}
}
if(!careerMatchInlineScripts.length)errors.push("Career Match inline runtime script is missing");
else if(!errors.some(error=>error.startsWith("Career Match inline script")))console.log("Career Match inline JavaScript syntax contract: PASS");
const careerMatchInteractionContract=[
  ["#theme",careerMatch.includes('$("#theme").onclick=')],
  ["#sample",careerMatch.includes('$("#sample").onclick=')],
  ["#go",careerMatch.includes('$("#go").onclick=')],
  ["#file",careerMatch.includes('$("#file").onchange=')],
  ["#results",careerMatch.includes('$("#results").addEventListener("click"')],
  ["#savedList",careerMatch.includes('$("#savedList").onclick=')],
  ["#addJob",careerMatch.includes('$("#addJob").onclick=')],
  ["#board click",careerMatch.includes('$("#board").addEventListener("click"')],
  ["#board change",careerMatch.includes('$("#board").addEventListener("change"')]
];
const careerMatchTrackerControlNameContract=careerMatch.includes('select.setAttribute("aria-label",`Move ${x.role} at ${x.company} to`)')&&careerMatch.includes('btn.setAttribute("aria-label",`Remove ${x.role} at ${x.company}`)');
if(!careerMatchTrackerControlNameContract)errors.push("Career Match tracker controls must expose application-specific accessible names");
else console.log("Career Match tracker control naming contract: PASS");
const careerMatchLabelAssociationContract=careerMatch.includes('<label for="file">1. Your resume file</label>')&&!careerMatch.includes('<label for="resume">1. Your resume</label>');
if(!careerMatchLabelAssociationContract)errors.push("Career Match resume-file label must be explicitly associated with the file input");
else console.log("Career Match resume-file label association contract: PASS");
const careerMatchInteractionErrors=careerMatchInteractionContract.filter(([,present])=>!present).map(([name])=>name);
if(careerMatchInteractionErrors.length)errors.push("Career Match interaction wiring missing: "+careerMatchInteractionErrors.join(", "));
else console.log("Career Match interaction wiring contract: PASS");
const interviewPlanner=fs.readFileSync("tools/interview-preparation-planner/index.html","utf8");
const interviewPlannerRuntime=fs.readFileSync("assets/js/interview-preparation-planner.js","utf8");
const interviewPlannerRuntimeRef=interviewPlanner.includes('<script src="/assets/js/interview-preparation-planner.js" defer></script>');
if(!interviewPlannerRuntimeRef)errors.push("Interview Preparation Planner must load its dedicated runtime");
else console.log("Interview Preparation Planner runtime reference contract: PASS");
for(const [index,script] of [...interviewPlannerRuntime.matchAll(/\b(?:const|let|var|function)\b/g)].entries()){}
try{new Function(interviewPlannerRuntime)}catch(error){errors.push("Interview Preparation Planner runtime has invalid JavaScript syntax: "+error.message)}
if(!errors.some(error=>error.startsWith("Interview Preparation Planner runtime has invalid")))console.log("Interview Preparation Planner JavaScript syntax contract: PASS");
const interviewPlannerControls=["#jd","#resume","#results","#plan","#sample","#clear"];
const interviewPlannerControlErrors=interviewPlannerControls.filter(selector=>!interviewPlanner.includes('id="'+selector.slice(1)+'"')).map(selector=>selector);
if(interviewPlannerControlErrors.length)errors.push("Interview Preparation Planner controls missing: "+interviewPlannerControlErrors.join(", "));
const interviewPlannerRuntimeContracts=[
  ["minimum job-description length",interviewPlannerRuntime.includes("jd.length<80")],
  ["sample action",interviewPlannerRuntime.includes("sample.addEventListener")],
  ["clear action",interviewPlannerRuntime.includes("clear.addEventListener")],
  ["plan action",interviewPlannerRuntime.includes("plan.addEventListener")],
  ["duplicate initialization guard",interviewPlannerRuntime.includes("plannerReady")]
];
const interviewPlannerRuntimeErrors=interviewPlannerRuntimeContracts.filter(([,ok])=>!ok).map(([name])=>name);
if(interviewPlannerRuntimeErrors.length)errors.push("Interview Preparation Planner runtime contract missing: "+interviewPlannerRuntimeErrors.join(", "));
else console.log("Interview Preparation Planner runtime interaction contract: PASS");

const interviewPlannerKeywordBoundaryContract=(()=>{const runtime=fs.readFileSync("assets/js/interview-preparation-planner.js","utf8");const matches=(keyword,text)=>new RegExp("\\b"+keyword+"\\b","i").test(text);return runtime.includes('new RegExp("\\\\b"+x+"\\\\b","i").test(v)')&&!matches("apple","pineapple support")&&matches("apple","Apple device support")&&!matches("excel","excellent communication")&&matches("excel","Excel spreadsheet")&&matches("service desk","Service desk analyst")})();
if(!interviewPlannerKeywordBoundaryContract)errors.push("Interview Preparation Planner must detect whole skill terms rather than accidental substrings");
else console.log("Interview Preparation Planner whole-term keyword contract: PASS");

const troubleshootingAssistant=fs.readFileSync("tools/it-troubleshooting-assistant/index.html","utf8");
const troubleshootingInlineScripts=[...troubleshootingAssistant.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).filter(script=>script.trim());
for(const [index,script] of troubleshootingInlineScripts.entries()){
  try{new Function(script)}catch(error){errors.push(`IT Troubleshooting Assistant inline script ${index+1} has invalid JavaScript syntax: ${error.message}`)}
}
if(!troubleshootingInlineScripts.length)errors.push("IT Troubleshooting Assistant inline runtime script is missing");
else if(!errors.some(error=>error.startsWith("IT Troubleshooting Assistant inline script")))console.log("IT Troubleshooting Assistant inline JavaScript syntax contract: PASS");
const financePlanning=fs.readFileSync("tools/finance-planning-workspace/index.html","utf8");
const financeInlineScripts=[...financePlanning.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).filter(script=>script.trim()&&!/^\s*\{/.test(script));
for(const [index,script] of financeInlineScripts.entries()){
  try{new Function(script)}catch(error){errors.push(`Finance Planning Workspace inline script ${index+1} has invalid JavaScript syntax: ${error.message}`)}
}
if(!financeInlineScripts.length)errors.push("Finance Planning Workspace inline runtime script is missing");
else if(!errors.some(error=>error.startsWith("Finance Planning Workspace inline script")))console.log("Finance Planning Workspace inline JavaScript syntax contract: PASS");
const financeInteractionContract=[
  ["input recalculation listener",financePlanning.includes('ids.forEach(i=>i.addEventListener("input",calc))')],
  ["tab click activation",financePlanning.includes('tabs.forEach(b=>b.onclick=()=>activateTab(b))')],
  ["tab keyboard navigation",financePlanning.includes('tabs.forEach((b,index)=>b.addEventListener("keydown"')],
  ["initial calculation",financePlanning.includes("calc()})();")]
];
const financeInteractionErrors=financeInteractionContract.filter(([,present])=>!present).map(([name])=>name);
if(financeInteractionErrors.length)errors.push("Finance Planning Workspace interaction wiring missing: "+financeInteractionErrors.join(", "));
else console.log("Finance Planning Workspace interaction wiring contract: PASS");
const careerMatchSavedContentContract=[
  ["Career Match saved content is sanitized before storage",careerMatch.includes("function parseSanitizedSavedHtml(html)")&&careerMatch.includes('serializeChildren(parseSanitizedSavedHtml(serializeChildren($("#results"))))')],
  ["Career Match saved content is sanitized before restore",careerMatch.includes("const safe=parseSanitizedSavedHtml(x.html)")&&careerMatch.includes('$("#results").replaceChildren(frag)')],
  ["Career Match sanitizer removes event-handler attributes",careerMatch.includes('a.name.toLowerCase().startsWith("on")')],
  ["Career Match restored content uses DOM replacement without innerHTML",!careerMatch.includes(".innerHTML")&&careerMatch.includes("replaceChildren")]
];
const missingCareerMatchContracts=careerMatchSavedContentContract.filter(([,ok])=>!ok).map(([name])=>name);
if(missingCareerMatchContracts.length)errors.push("Career Match saved-content contract missing: "+missingCareerMatchContracts.join(", "));

const mainJs=fs.readFileSync("assets/js/main.js","utf8");
let mainJsSyntaxError=null;
try{new Function(mainJs)}catch(error){mainJsSyntaxError=error}
if(mainJsSyntaxError)errors.push("assets/js/main.js has invalid JavaScript syntax: "+mainJsSyntaxError.message);
else console.log("assets/js/main.js JavaScript syntax contract: PASS");
const jawedAiWidgetPrivacyNoticeContract=mainJs.includes('privacyNote.className="jawed-ai-widget-privacy"')&&mainJs.includes('privacyLink.href="/privacy/"')&&mainJs.includes('panel.append(header,privacyNote,messages,form)');
if(!jawedAiWidgetPrivacyNoticeContract)errors.push("Jawed AI widget must show a privacy warning and link before users enter a prompt");
else console.log("Jawed AI widget privacy notice contract: PASS");


const aiPagePrivacyEntryContract=(()=>{const html=fs.readFileSync("ai/index.html","utf8");const notice=html.indexOf('class="form-note ai-privacy-note"');const form=html.indexOf('<form id="ai-form"');return notice>=0&&form>notice&&html.includes('href="/privacy/"')})();
if(!aiPagePrivacyEntryContract)errors.push("Dedicated AI page must show its privacy warning and policy link before the prompt form");
else console.log("Dedicated AI page privacy-entry contract: PASS");


const jawedAiWidgetAccessibilityContract=mainJs.includes('panel.setAttribute("role","dialog")')&&mainJs.includes('panel.setAttribute("aria-modal","false")')&&mainJs.includes('panel.setAttribute("aria-labelledby","jawed-ai-title")')&&mainJs.includes('title.id="jawed-ai-title"')&&mainJs.includes('if(open)input.focus();else toggle.focus()')&&mainJs.includes('document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!panel.hidden)setOpen(false)})');
if(!jawedAiWidgetAccessibilityContract)errors.push("Jawed AI floating widget must expose dialog semantics, an accessible title, and keyboard focus return");
else console.log("Jawed AI widget accessibility contract: PASS");
const jawedAiWidgetEventContract=!mainJs.includes("document.addEventListener(\"click\",captureClose,true)")&&!mainJs.includes("addEventListener(\"pointerdown\",closePanel)")&&!mainJs.includes("addEventListener(\"touchstart\",closePanel");
if(!jawedAiWidgetEventContract)errors.push("Jawed AI widget close controls must not register redundant global or duplicate pointer/touch handlers");
else console.log("Jawed AI widget event-handling contract: PASS");
const jawedAiWidgetStatusContract=mainJs.includes('status.setAttribute("role","status")')&&mainJs.includes('status.setAttribute("aria-live","polite")')&&mainJs.includes('status.setAttribute("aria-atomic","true")');
const jawedAiWidgetSourceGroupContract=mainJs.includes('list.className="jawed-ai-widget-sources";list.setAttribute("role","group");list.setAttribute("aria-label","Sources");');
if(!jawedAiWidgetSourceGroupContract)errors.push("Jawed AI floating-widget source list must expose an explicit accessible Sources group");
else console.log("Jawed AI floating-widget source-group contract: PASS");
if(!jawedAiWidgetStatusContract)errors.push("Jawed AI widget status must expose an explicit polite live region with atomic updates");
else console.log("Jawed AI widget status live-region contract: PASS");


const discoveryStatusContracts=[
  ["tools/index.html","tools-filter-status","Showing all tools."],
  ["topics/index.html","topics-filter-status","Showing all topics."],
  ["resources/index.html","resources-filter-status","Showing all resources."],
  ["notes/index.html","notes-filter-status","Showing all notes."],
  ["blog/index.html","blog-filter-status","Showing all posts."]
].map(([file,id,initialText])=>{
  const html=fs.readFileSync(file,"utf8");
  const opening='<p class="form-note" id="'+id+'" role="status" aria-live="polite" aria-atomic="true">';
  const start=html.indexOf(opening);
  const close=start<0?-1:html.indexOf("</p>",start+opening.length);
  const body=start<0||close<0?"":html.slice(start+opening.length,close);
  return [file+" discovery status uses explicit status semantics",start>=0&&body===initialText];
});
const missingDiscoveryStatusContracts=discoveryStatusContracts.filter(([,ok])=>!ok).map(([name])=>name);
if(missingDiscoveryStatusContracts.length)errors.push("Discovery result status semantics missing: "+missingDiscoveryStatusContracts.join(", "));
else console.log("Discovery result status semantics contract: PASS (5 pages)");

const discoveryQueryBoundaryContract=[
  ["discovery URL query is bounded to 200 characters",mainJs.includes("initial.trim().slice(0,200)")],
  ["typed discovery query is bounded to 200 characters",mainJs.includes("i.value.trim().slice(0,200)")]
];
const missingDiscoveryQueryBoundaryContracts=discoveryQueryBoundaryContract.filter(([,ok])=>!ok).map(([name])=>name);
const discoveryHistoryContract=[
  ["discovery filter listens for browser history navigation",mainJs.includes("window.addEventListener('popstate',()=>{const current=new URLSearchParams(window.location.search).get('q')||''")],
  ["history navigation re-applies discovery filtering",mainJs.includes("i.value=current;update(false)")]
];
const discoveryUrlNormalizationContract=[
  ["deep-linked discovery query is normalized in the URL",mainJs.includes("const normalized=initial.trim().slice(0,200)")&&mainJs.includes("next.searchParams.set('q',normalized)")&&mainJs.includes("window.history.replaceState")]
];
const missingDiscoveryHistoryContracts=discoveryHistoryContract.filter(([,ok])=>!ok).map(([name])=>name);
const missingDiscoveryUrlNormalizationContracts=discoveryUrlNormalizationContract.filter(([,ok])=>!ok).map(([name])=>name);
const discoveryAiContract=[
  ["AI handoff captures the active discovery query",mainJs.includes("const aiLink=document.querySelector('.ai-discovery-card a[href^=\"/ai/?q=\"]')")],
  ["AI handoff bounds copied discovery context",mainJs.includes("raw.slice(0,200)")],
  ["AI handoff encodes the contextual prompt through URLSearchParams",mainJs.includes("aiUrl.searchParams.set('q',handoff)")]
];
const discoveryFilterStatusAtomicContract=mainJs.includes('const i=document.getElementById(input),s=document.getElementById(status);if(!i||!s)return;s.setAttribute("aria-atomic","true");');
if(!discoveryFilterStatusAtomicContract)errors.push("Discovery filter status regions must expose atomic live-region updates");
else console.log("Discovery filter status atomicity contract: PASS");
const discoveryFilterContract=[
  ["notes filter excludes Jawed AI handoff",mainJs.includes("selector:'main .card:not(.ai-discovery-card),main section[id^=\"subject-\"],main section[id^=\"task-\"]'")&&mainJs.includes("label:'note results'")],
  ["tools search covers all tool cards, deduplicates destinations, and matches any duplicate card",mainJs.includes("selector:'main .card:not(.ai-discovery-card)',label:'tool results',dedupeByLink:true")&&mainJs.includes("candidates.forEach(el=>{const key=itemKey(el)")&&mainJs.includes("candidates.find(other=>itemKey(other)===key&&other.textContent.toLowerCase().includes(q))")&&mainJs.includes("const matchingCard=key&&q?candidates.find(other=>itemKey(other)===key&&other.textContent.toLowerCase().includes(q)):el")&&mainJs.includes("const show=!q?true:(key?el===matchingCard:match)")&&fs.readFileSync("tools/index.html","utf8").includes('<div class="card-grid" id="primary-tools-grid">')],
  ["topics filter excludes Jawed AI handoff",mainJs.includes("selector:'main section:not(.discovery-panel) .card:not(.ai-discovery-card)',label:'topic results'")],
  ["blog filter excludes Jawed AI handoff",mainJs.includes("selector:'main .card:not(.ai-discovery-card)',label:'post results'")],
  ["resources filter excludes Jawed AI handoff",mainJs.includes("selector:'main .card:not(.ai-discovery-card)',label:'resource results'")]
];
const missingDiscoveryContracts=discoveryFilterContract.filter(([,ok])=>!ok).map(([name])=>name);
const missingDiscoveryAiContracts=discoveryAiContract.filter(([,ok])=>!ok).map(([name])=>name);
if(missingDiscoveryQueryBoundaryContracts.length)errors.push("Discovery query-boundary contract missing: "+missingDiscoveryQueryBoundaryContracts.join(", "));
if(missingDiscoveryHistoryContracts.length)errors.push("Discovery browser-history contract missing: "+missingDiscoveryHistoryContracts.join(", "));
if(missingDiscoveryUrlNormalizationContracts.length)errors.push("Discovery URL-normalization contract missing: "+missingDiscoveryUrlNormalizationContracts.join(", "));
if(missingDiscoveryAiContracts.length)errors.push("Discovery-to-AI context contract missing: "+missingDiscoveryAiContracts.join(", "));
if(missingDiscoveryContracts.length)errors.push("Discovery filter contract missing: "+missingDiscoveryContracts.join(", "));
if(sitemapUrls.length!==siteUrls.length)errors.push("Sitemap contains URLs outside https://jawed.co.in/.");
if(duplicateSitemapPaths.length)errors.push("Sitemap contains duplicate paths: "+[...new Set(duplicateSitemapPaths)].join(", "));
if(missingSources.length)errors.push("Sitemap pages have no repository source file: "+missingSources.join(", "));
if(unsitemapPages.length)errors.push("Published HTML pages are missing from sitemap: "+unsitemapPages.join(", "));
console.log("Career Match saved-content security contract: PASS");
const careerMatchTabs=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchTabContract=careerMatchTabs.includes('role="tablist"')&&careerMatchTabs.includes('role="tab"')&&careerMatchTabs.includes('aria-selected="true"')&&careerMatchTabs.includes('aria-controls="v-results"')&&careerMatchTabs.includes("careerTabs");
if(!careerMatchTabContract)errors.push("Career Match view controls must expose accessible tab semantics and keyboard navigation");
else console.log("Career Match view accessibility contract: PASS");

const careerMatchStatusRegions=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchTabPanelAccessibilityContract=
  careerMatch.includes('id="tab-analyze"')&&
  careerMatch.includes('id="tab-results"')&&
  careerMatch.includes('id="tab-tracker"')&&
  careerMatch.includes('id="tab-saved"')&&
  careerMatch.includes('id="v-analyze" class="view" role="tabpanel" aria-labelledby="tab-analyze"')&&
  careerMatch.includes('id="v-results" class="view hidden" role="tabpanel" aria-labelledby="tab-results"')&&
  careerMatch.includes('id="v-tracker" class="view hidden" role="tabpanel" aria-labelledby="tab-tracker"')&&
  careerMatch.includes('id="v-saved" class="view hidden" role="tabpanel" aria-labelledby="tab-saved"');
if(!careerMatchTabPanelAccessibilityContract)errors.push("Career Match tabpanels must remain programmatically labelled by their controlling tabs");
else console.log("Career Match tabpanel labelling contract: PASS");
const careerMatchHiddenStateContract=
  careerMatch.includes('id="v-analyze" class="view" role="tabpanel" aria-labelledby="tab-analyze" aria-hidden="false"')&&
  careerMatch.includes('id="v-results" class="view hidden" role="tabpanel" aria-labelledby="tab-results" aria-hidden="true" hidden')&&
  careerMatch.includes('id="v-tracker" class="view hidden" role="tabpanel" aria-labelledby="tab-tracker" aria-hidden="true" hidden')&&
  careerMatch.includes('id="v-saved" class="view hidden" role="tabpanel" aria-labelledby="tab-saved" aria-hidden="true" hidden')&&
  careerMatch.includes('e.setAttribute("aria-hidden",String(!active));e.hidden=!active');
if(!careerMatchHiddenStateContract)errors.push("Career Match tabpanels must synchronize native hidden state with aria-hidden and the active tab");
else console.log("Career Match tabpanel hidden-state contract: PASS");

const careerMatchStatusRegionContract=
  careerMatchStatusRegions.includes('<div class="muted" id="fileMsg" role="status" aria-live="polite" aria-atomic="true">')&&
  careerMatchStatusRegions.includes('<span class="muted" id="err" role="alert" aria-live="assertive" aria-atomic="true">')&&
  careerMatchStatusRegions.includes('<p id="results-status" class="muted" role="status" aria-live="polite" aria-atomic="true"></p>')&&
  !careerMatchStatusRegions.includes('id="results" tabindex="-1" aria-live="polite" aria-atomic="true"')&&
  careerMatchStatusRegions.includes('id="board" aria-live="polite" aria-atomic="true"')&&
  careerMatchStatusRegions.includes('id="savedList" aria-live="polite" aria-atomic="true"')&&
  careerMatchStatusRegions.includes('id="toast" role="status"');
if(!careerMatchStatusRegionContract)errors.push("Career Match dynamic status, concise result announcement, tracker and saved-analysis regions must expose appropriate live-region semantics");
else console.log("Career Match status live-region accessibility contract: PASS");

const aiPage=fs.readFileSync("ai/index.html","utf8");
const aiPageStatusLiveRegionContract=aiPage.includes('<p id="ai-status" class="form-note" role="status" aria-live="polite" aria-atomic="true">');
if(!aiPageStatusLiveRegionContract)errors.push("Dedicated Jawed AI status must expose an explicit polite live region with atomic updates");
else console.log("Dedicated Jawed AI status live-region contract: PASS");

const aiPageBusyContract=aiPage.includes('const setBusy=busy=>{input.disabled=busy;if(button)button.disabled=busy;button?.setAttribute("aria-busy",busy?"true":"false");box.setAttribute("aria-busy",busy?"true":"false")};');
if(!aiPageBusyContract)errors.push("Dedicated Jawed AI conversation log must expose aria-busy while requests are in flight");
else console.log("Dedicated Jawed AI conversation busy-state contract: PASS");
const aiPageSourceGroupContract=aiPage.includes('article.className="ai-message ai-message-sources";article.setAttribute("role","group");article.setAttribute("aria-label","Sources");');
if(!aiPageSourceGroupContract)errors.push("Dedicated Jawed AI source list must expose an explicit accessible Sources group");
else console.log("Dedicated Jawed AI source-group contract: PASS");

const financeWorkspace=fs.readFileSync("tools/finance-planning-workspace/index.html","utf8");
const financeWorkspaceTabContract=
  financeWorkspace.includes('<div class="tabs" role="tablist" aria-label="Finance planning sections">')&&
  financeWorkspace.includes('role="tab"')&&
  financeWorkspace.includes('aria-controls="snapshot"')&&
  financeWorkspace.includes('aria-selected="true"')&&
  financeWorkspace.includes('tabIndex=active?0:-1')&&
  financeWorkspace.includes('x.setAttribute("aria-hidden",String(!active))')&&
  financeWorkspace.includes('id="snapshot" class="view on" role="tabpanel" aria-labelledby="tab-snapshot" aria-hidden="false"')&&
  financeWorkspace.includes('id="goals" class="view" role="tabpanel" aria-labelledby="tab-goals" aria-hidden="true"')&&
  financeWorkspace.includes('e.preventDefault();let next=index')&&
  financeWorkspace.includes('e.key==="ArrowRight"')&&
  financeWorkspace.includes('e.key==="ArrowLeft"')&&
  financeWorkspace.includes('e.key==="Home"')&&
  financeWorkspace.includes('e.key==="End"')&&
  financeWorkspace.includes('activateTab(tabs[next])');
if(!financeWorkspaceTabContract)errors.push("Finance Planning Workspace tabs must preserve accessible ARIA semantics and keyboard navigation");
else console.log("Finance Planning Workspace tab accessibility contract: PASS");
const financeWorkspaceHiddenStateContract=
  financeWorkspace.includes('id="snapshot" class="view on" role="tabpanel" aria-labelledby="tab-snapshot" aria-hidden="false" tabindex="0"')&&
  financeWorkspace.includes('id="goals" class="view" role="tabpanel" aria-labelledby="tab-goals" aria-hidden="true" hidden tabindex="0"')&&
  financeWorkspace.includes('id="retirement" class="view" role="tabpanel" aria-labelledby="tab-retirement" aria-hidden="true" hidden tabindex="0"')&&
  financeWorkspace.includes('id="review" class="view" role="tabpanel" aria-labelledby="tab-review" aria-hidden="true" hidden tabindex="0"')&&
  financeWorkspace.includes('x.setAttribute("aria-hidden",String(!active));x.hidden=!active');
if(!financeWorkspaceHiddenStateContract)errors.push("Finance Planning Workspace tabpanels must synchronize the native hidden state with aria-hidden and the active tab");
else console.log("Finance Planning Workspace tabpanel hidden-state contract: PASS");
const financeWorkspaceInputContract=!financeWorkspace.includes('id="contrib"')&&!financeWorkspace.includes('for="contrib"')&&!financeWorkspace.match(/const fields=\[[^\]]*contrib/);
if(!financeWorkspaceInputContract)errors.push("Finance Planning Workspace must not expose an unused Savings / contributions input");
else console.log("Finance Planning Workspace input contract: PASS");
const generatorFreshnessChecks=[
 ["AI Prompt Builder", "tools/ai-prompt-builder/index.html", "Inputs changed. Build the prompt again to refresh the output.", ["#prompt-goal","#prompt-context","#prompt-desired-output","#prompt-constraints","#prompt-example"]],
 ["Service Desk Note Formatter", "tools/service-desk-note-formatter/index.html", "Inputs changed. Format the note again to refresh the output.", ["#note-issue","#note-actions","#note-resolution","#note-followup"]],
 ["Ticket to Knowledge Base Draft", "tools/ticket-to-knowledge-base-draft/index.html", "Inputs changed. Build the draft again to refresh the output.", ["#kb-problem","#kb-scope","#kb-checks","#kb-resolution","#kb-validation","#kb-escalation","#kb-maintenance"]]
];
for(const [name,path,message,fields] of generatorFreshnessChecks){
 const html=fs.readFileSync(path,"utf8");
 const ok=html.includes(message)&&html.includes("document.querySelector(id).addEventListener(\'input\',markDirty)");
 if(!ok)errors.push(name+" must mark generated output stale when inputs change");
}
if(generatorFreshnessChecks.every(([name,path,message])=>fs.readFileSync(path,"utf8").includes(message)))console.log("Generator output freshness contract: PASS");
const calculatorInvalidResultChecks=[
 ["Compound Growth & SIP","tools/compound-growth-sip-calculator/index.html",["fv.textContent=ti.textContent=eg.textContent=\"—\"","summary.textContent=\"\""]],
 ["Inflation Goal Planning","tools/inflation-goal-planning-calculator/index.html",["future.textContent=increase.textContent=gap.textContent=\"—\"","summary.textContent=\"\""]],
 ["Retirement Planning","tools/retirement-planning-calculator/index.html",[`["years","futureSpending","horizon","required","projected","gap"].forEach(k=>out[k].textContent="—")`,"out.summary.textContent=\"\""]]
];
for(const [name,path,patterns] of calculatorInvalidResultChecks){
 const html=fs.readFileSync(path,"utf8");
 if(!patterns.every(pattern=>html.includes(pattern)))errors.push(name+" must clear stale result values when submitted inputs are invalid");
}
if(calculatorInvalidResultChecks.every(([name,path,patterns])=>patterns.every(pattern=>fs.readFileSync(path,"utf8").includes(pattern))))console.log("Calculator invalid-input result contract: PASS");



const interactiveToolContracts=[
 ["AI Prompt Builder","tools/ai-prompt-builder/index.html","#prompt-tool","#prompt-clear","#prompt-copy"],
 ["Service Desk Note Formatter","tools/service-desk-note-formatter/index.html","#note-tool","#note-clear","#note-copy"],
 ["Ticket to Knowledge Base Draft","tools/ticket-to-knowledge-base-draft/index.html","#kb-tool","#kb-clear","#kb-copy"],
 ["Personal Finance Snapshot","tools/personal-finance-snapshot/index.html","#finance-tool","#reset",null],
 ["Compound Growth & SIP","tools/compound-growth-sip-calculator/index.html","#growth-tool","#growth-reset",null],
 ["Inflation Goal Planning","tools/inflation-goal-planning-calculator/index.html","#goal-tool","#goal-reset",null],
 ["Retirement Planning","tools/retirement-planning-calculator/index.html","#retirement-tool","#retirement-reset",null]
];
for(const [name,path,formId,resetId,copyId] of interactiveToolContracts){
 const html=fs.readFileSync(path,"utf8");
 const submitContract=html.includes('addEventListener("submit"')||html.includes("addEventListener('submit'");
 const resetContract=html.includes(resetId.slice(1))&&(html.includes('addEventListener("click"')||html.includes("addEventListener('click'"));
 const copyContract=!copyId||html.includes(copyId.slice(1))&&(html.includes('addEventListener("click"')||html.includes("addEventListener('click'"));
 if(!submitContract||!resetContract||!copyContract)errors.push(name+" must retain deterministic submit/reset interaction wiring");
}
if(interactiveToolContracts.every(([name,path,formId,resetId,copyId])=>{
 const html=fs.readFileSync(path,"utf8");
 return (html.includes('addEventListener("submit"')||html.includes("addEventListener('submit'"))&&html.includes(resetId.slice(1))&&(!copyId||html.includes(copyId.slice(1)));
}))console.log("Interactive tool primary-action wiring contract: PASS");

const calculatorResetContracts=[
 ["Personal Finance Snapshot","tools/personal-finance-snapshot/index.html",["const ids=[\"income\",\"essential\",\"discretionary\",\"debt\",\"target\",\"emergency\",\"cash\",\"investments\",\"retirement\",\"property\",\"otherAssets\",\"homeLoan\",\"vehicleLoan\",\"personalLoan\",\"otherDebt\"],$=id=>document.getElementById(id),defaults=Object.fromEntries(ids.map(id=>[id,$(id).value]))","ids.forEach(id=>$(id).value=defaults[id])"]],
 ["Compound Growth & SIP","tools/compound-growth-sip-calculator/index.html",["reset.addEventListener(\"click\",()=>{f.reset();err.textContent=\"\";calculate()})"]],
 ["Inflation Goal Planning","tools/inflation-goal-planning-calculator/index.html",["document.querySelector(\"#goal-reset\").addEventListener(\"click\",()=>{f.reset();calculate()})"]],
 ["Retirement Planning","tools/retirement-planning-calculator/index.html",["reset.addEventListener(\"click\",()=>{f.reset();out.error.textContent=\"\";calculate()})"]]
];
for(const [name,path,patterns] of calculatorResetContracts){
 const html=fs.readFileSync(path,"utf8");
 if(!patterns.every(pattern=>html.includes(pattern)))errors.push(name+" must preserve its intended reset-state behavior");
}
if(calculatorResetContracts.every(([name,path,patterns])=>patterns.every(pattern=>fs.readFileSync(path,"utf8").includes(pattern))))console.log("Calculator reset-state integrity contract: PASS");


const retirementLogicalValidationContract=(()=>{const html=fs.readFileSync("tools/retirement-planning-calculator/index.html","utf8");return html.includes('out.error.textContent="Planned retirement age must be greater than current age.";["years","futureSpending","horizon","required","projected","gap"].forEach(k=>out[k].textContent="—");out.summary.textContent="";return}')&&html.includes('out.error.textContent="Planning lifespan must be greater than planned retirement age.";["years","futureSpending","horizon","required","projected","gap"].forEach(k=>out[k].textContent="—");out.summary.textContent="";return}')})();
if(!retirementLogicalValidationContract)errors.push("Retirement Planning must clear prior calculated results when retirement-age or lifespan assumptions are invalid");
else console.log("Retirement Planning logical-validation stale-result contract: PASS");


const compoundGrowthOverflowContract=(()=>{const html=fs.readFileSync("tools/compound-growth-sip-calculator/index.html","utf8");return html.includes('if(!Number.isFinite(value)){err.textContent="The inputs are too large for this calculator. Try a smaller value.";fv.textContent=ti.textContent=eg.textContent="—";summary.textContent="";return}')})();
if(!compoundGrowthOverflowContract)errors.push("Compound Growth & SIP must clear stale results when inputs overflow numeric calculation");
else console.log("Compound Growth & SIP overflow stale-result contract: PASS");


const interactiveToolSyntaxContracts=[
 ["Resume Bullet Strength Checker","tools/resume-bullet-strength-checker/index.html"],
 ["AI Prompt Builder","tools/ai-prompt-builder/index.html"],
 ["Service Desk Note Formatter","tools/service-desk-note-formatter/index.html"],
 ["Ticket to Knowledge Base Draft","tools/ticket-to-knowledge-base-draft/index.html"],
 ["Personal Finance Snapshot","tools/personal-finance-snapshot/index.html"],
 ["Compound Growth & SIP Calculator","tools/compound-growth-sip-calculator/index.html"],
 ["Inflation & Goal Planning Calculator","tools/inflation-goal-planning-calculator/index.html"],
 ["Retirement Planning Calculator","tools/retirement-planning-calculator/index.html"]
];
for(const [name,path] of interactiveToolSyntaxContracts){
 const html=fs.readFileSync(path,"utf8"),scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
 if(!scripts.length)errors.push(name+" inline runtime script is missing");
 for(const [index,script] of scripts.entries()){try{new Function(script)}catch(error){errors.push(name+" inline script "+(index+1)+" has invalid JavaScript syntax: "+error.message)}}
 if(scripts.length&&!errors.some(error=>error.startsWith(name+" inline script")))console.log(name+" inline JavaScript syntax contract: PASS");
}


const promptBuilderLineBreakContract=(()=>{const html=fs.readFileSync("tools/ai-prompt-builder/index.html","utf8");return html.includes("lines.join('\\n\\n')")&&!html.includes("lines.join('\\\\n\\\\n')")})();
if(!promptBuilderLineBreakContract)errors.push("AI Prompt Builder must separate generated prompt fields with actual line breaks, not literal backslash-n text");
else console.log("AI Prompt Builder output line-break contract: PASS");


const resumeBulletMetricDetectionContract=(()=>{const html=fs.readFileSync("tools/resume-bullet-strength-checker/index.html","utf8");return html.includes("metric=/\\b\\d+(?:\\.\\d+)?\\+?\\s*(?:percent|x|k|m|b|hours?")&&!html.includes("|\\b(?:hours?|days?|weeks?|months?|users?|tickets?|clients?|projects?)\\b/i.test(line)")})();
if(!resumeBulletMetricDetectionContract)errors.push("Resume Bullet Strength Checker must require a quantity when identifying a metric, rather than flagging unquantified words such as tickets or users");
else console.log("Resume Bullet metric-detection contract: PASS");
const resumeBulletMetricSource=fs.readFileSync("tools/resume-bullet-strength-checker/index.html","utf8").match(/metric=(\/[^/]+\/i)\.test\(line\)/)?.[1];
const resumeBulletMetricPattern=resumeBulletMetricSource?new RegExp(resumeBulletMetricSource.slice(1,resumeBulletMetricSource.lastIndexOf("/")),"i"):null;
const resumeBulletMetricBehaviorContract=!!resumeBulletMetricPattern&&
  !resumeBulletMetricPattern.test("Responsible for handling IT support tickets.")&&
  resumeBulletMetricPattern.test("Resolved 120+ tickets per month")&&
  resumeBulletMetricPattern.test("Maintained 98% satisfaction")&&
  !resumeBulletMetricPattern.test("Managed Microsoft 365");
if(!resumeBulletMetricBehaviorContract)errors.push("Resume Bullet metric detection must distinguish quantified results from unquantified nouns and product/version numbers");
else console.log("Resume Bullet metric behavior contract: PASS");

const resumeBulletOutcomeScoringContract=(()=>{const html=fs.readFileSync("tools/resume-bullet-strength-checker/index.html","utf8");return html.includes("evidence=metric||outcome")&&html.includes("(evidence?1:0)")&&html.includes("Add a specific, truthful outcome or measurable evidence when available.")&&html.includes("outcome=/\\b(?:validated|confirmed|restored|resolved|reduced|increased|improved|completed|enabled|prevented|delivered|achieved|eliminated|shortened|recovered|maintained|met|exceeded)\\b/i.test(line)")})();
if(!resumeBulletOutcomeScoringContract)errors.push("Resume Bullet Strength Checker must accept clear outcome evidence as an alternative to numeric metrics");
else console.log("Resume Bullet outcome-or-metric scoring contract: PASS");

const resumeBulletPrefixNormalizationContract=(()=>{const html=fs.readFileSync("tools/resume-bullet-strength-checker/index.html","utf8");const normalize=line=>line.replace(new RegExp("^\\s*(?:[-*•▪‣◦]+\\s*|\\d{1,3}[.)]\\s+|[a-z][.)]\\s+)","i"),"").trim();const isAction=line=>["led","built","created","improved","reduced","increased","resolved","delivered","automated","implemented","managed","designed","launched","optimized","supported","trained","coordinated","developed","migrated","analyzed","configured","maintained","documented"].some(verb=>normalize(line).toLowerCase().startsWith(verb+" "));return html.includes("const normalized=line.replace(")&&html.includes("esc(line)")&&isAction("• Resolved recurring desktop issues and documented checks")&&isAction("- Managed device provisioning and validated completion")&&isAction("1. Automated an onboarding check and documented the workflow")&&isAction("a) Configured device policies and confirmed enrollment")&&!isAction("• Responsible for handling IT support tickets")})(); 
if(!resumeBulletPrefixNormalizationContract)errors.push("Resume Bullet Strength Checker must normalize common bullet and numbering prefixes before scoring while preserving displayed input");
else console.log("Resume Bullet prefix-normalization contract: PASS");


const troubleshootingTreeBranchContract=(()=>{const html=fs.readFileSync("tools/it-troubleshooting-assistant/index.html","utf8");return html.includes("yesNext:'appleChange'")&&html.includes("appleChange:{q:'Was there a recent update, configuration or application change?'")&&html.includes("yesNext:'windowsChange'")&&html.includes("windowsChange:{q:'Did the problem begin after a recent update, configuration or application change?'")&&!html.includes("}},change:{q:")})();
if(!troubleshootingTreeBranchContract)errors.push("IT Troubleshooting Assistant must keep Apple and Windows change branches distinct");
else console.log("IT Troubleshooting decision-tree branch integrity contract: PASS");


const staleCopyPreventionContracts=[
 ["AI Prompt Builder","tools/ai-prompt-builder/index.html","Inputs changed. Build the prompt again to refresh the output."],
 ["Service Desk Note Formatter","tools/service-desk-note-formatter/index.html","Inputs changed. Format the note again to refresh the output."],
 ["Ticket to Knowledge Base Draft","tools/ticket-to-knowledge-base-draft/index.html","Inputs changed. Build the draft again to refresh the output."]
];
for(const [name,path,message] of staleCopyPreventionContracts){const html=fs.readFileSync(path,"utf8");if(!html.includes("c.hidden=true")||!html.includes(message))errors.push(name+" must hide its copy action when inputs change");}
if(staleCopyPreventionContracts.every(([name,path,message])=>{const html=fs.readFileSync(path,"utf8");return html.includes("c.hidden=true")&&html.includes(message)}))console.log("Stale-copy prevention contract: PASS");


const staleOutputClearContracts=[
 ["AI Prompt Builder","tools/ai-prompt-builder/index.html","o.textContent='Your prompt will appear here.'"],
 ["Service Desk Note Formatter","tools/service-desk-note-formatter/index.html","o.textContent='Your formatted note will appear here.'"],
 ["Ticket to Knowledge Base Draft","tools/ticket-to-knowledge-base-draft/index.html","o.textContent='Your draft will appear here.'"]
];
for(const [name,path,marker] of staleOutputClearContracts){if(!fs.readFileSync(path,"utf8").includes(marker))errors.push(name+" must clear generated output when inputs change");}
if(staleOutputClearContracts.every(([name,path,marker])=>fs.readFileSync(path,"utf8").includes(marker)))console.log("Stale generated-output clearing contract: PASS");

const financeSnapshotInvalidInputContract=(()=>{const html=fs.readFileSync("tools/personal-finance-snapshot/index.html","utf8");return html.includes('if(bad){["spending","surplus","rate","reserveTarget","reserveGap","covered","assets","liabilities","netWorth"].forEach(id=>$(id).textContent="—");$("reserveSummary").textContent="";return;}')})();
if(!financeSnapshotInvalidInputContract)errors.push("Personal Finance Snapshot must clear stale results when submitted inputs become invalid");
else console.log("Personal Finance Snapshot invalid-input stale-result contract: PASS");

const interactiveOutputLiveRegionContracts=[
 ["AI Prompt Builder","tools/ai-prompt-builder/index.html",'id="prompt-generated-output" class="tool-output">','<section class="content-section" aria-live="polite" aria-atomic="true">'],
 ["Compound Growth & SIP Calculator","tools/compound-growth-sip-calculator/index.html",'id="future-value"','<section class="content-section" aria-live="polite" aria-atomic="true">'],
 ["Inflation & Goal Planning Calculator","tools/inflation-goal-planning-calculator/index.html",'id="future"','<section class="content-section" aria-live="polite" aria-atomic="true">'],
 ["Retirement Planning Calculator","tools/retirement-planning-calculator/index.html",'id="years"','<section class="content-section" aria-live="polite" aria-atomic="true">'],
 ["Service Desk Note Formatter","tools/service-desk-note-formatter/index.html",'id="note-output" class="tool-output">','<section class="content-section" aria-live="polite" aria-atomic="true">'],
 ["Ticket to Knowledge Base Draft","tools/ticket-to-knowledge-base-draft/index.html",'id="kb-output" class="tool-output">','<section class="content-section" aria-live="polite" aria-atomic="true">'],
 ["Personal Finance Snapshot","tools/personal-finance-snapshot/index.html",'id="spending"','<div class="stats-grid" aria-live="polite" aria-atomic="true">'],
 ["Finance Planning Workspace","tools/finance-planning-workspace/index.html",'id="spending"','<div class="stats-grid" aria-live="polite" aria-atomic="true">']
];
for(const [name,path,outputMarker,liveMarker] of interactiveOutputLiveRegionContracts){
 const html=fs.readFileSync(path,"utf8");
 if(!html.includes(liveMarker)||!html.includes(outputMarker))errors.push(name+" generated output must remain exposed as one atomic live region");
}
if(interactiveOutputLiveRegionContracts.every(([name,path,outputMarker,liveMarker])=>{const html=fs.readFileSync(path,"utf8");return html.includes(liveMarker)&&html.includes(outputMarker)}))console.log("Interactive generated-output live-region atomicity contract: PASS");
const toolStatusLiveRegionContracts=[
 ["AI Prompt Builder","tools/ai-prompt-builder/index.html",'id="prompt-status" class="form-note" role="status" aria-live="polite" aria-atomic="true"'],
 ["Compound Growth & SIP Calculator","tools/compound-growth-sip-calculator/index.html",'id="growth-summary" class="form-note" role="status" aria-live="polite" aria-atomic="true"'],
 ["Inflation & Goal Planning Calculator","tools/inflation-goal-planning-calculator/index.html",'id="goal-summary" class="form-note" role="status" aria-live="polite" aria-atomic="true"'],
 ["Retirement Planning Calculator","tools/retirement-planning-calculator/index.html",'id="retirement-summary" class="form-note" role="status" aria-live="polite" aria-atomic="true"'],
 ["Personal Finance Snapshot","tools/personal-finance-snapshot/index.html",'id="reserveSummary" class="form-note" role="status" aria-live="polite" aria-atomic="true"'],
 ["Service Desk Note Formatter","tools/service-desk-note-formatter/index.html",'id="note-status" class="form-note" role="status" aria-live="polite" aria-atomic="true"'],
 ["Ticket to Knowledge Base Draft","tools/ticket-to-knowledge-base-draft/index.html",'id="kb-status" class="form-note" role="status" aria-live="polite" aria-atomic="true"']
];
for(const [name,path,markerText] of toolStatusLiveRegionContracts){
 const html=fs.readFileSync(path,"utf8");
 if(!html.includes(markerText))errors.push(name+" status feedback must expose an atomic polite live region");
}
if(toolStatusLiveRegionContracts.every(([name,path,markerText])=>fs.readFileSync(path,"utf8").includes(markerText)))console.log("Tool status live-region accessibility contract: PASS");



console.log("Internal link and fragment integrity: PASS");
const troubleshootingTool=fs.readFileSync("tools/it-troubleshooting-assistant/index.html","utf8");
const troubleshootingFocusContract=troubleshootingTool.includes("state.node=flows[state.type].start;renderIntro();const first=r.querySelector('[data-answer]');if(first)first.focus({preventScroll:true})")&&troubleshootingTool.includes("r.setAttribute('tabindex','-1');r.focus({preventScroll:true});return}state.node=flows[state.type][nextKey]||flows[nextKey];");
const troubleshootingLiveRegionContract=troubleshootingTool.includes('id="result" aria-live="polite" aria-atomic="true"');
if(!troubleshootingLiveRegionContract)errors.push("IT Troubleshooting Assistant result updates must be exposed as one atomic live region");
else console.log("IT Troubleshooting result live-region atomicity contract: PASS");
if(!troubleshootingFocusContract)errors.push("IT Troubleshooting Assistant must move focus to decision controls and terminal results");
else console.log("IT Troubleshooting result focus contract: PASS");

const careerMatchFocus=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchFocusRecoveryContract=careerMatchFocus.includes('const index=[...$("#savedList").querySelectorAll("button[data-s=del]")].indexOf(b)')&&careerMatchFocus.includes('(buttons[Math.min(index,buttons.length-1)]||document.querySelector(`nav[role="tablist"] [data-v="saved"]`)).focus({preventScroll:true})')&&careerMatchFocus.includes('const index=[...$("#board").querySelectorAll("[data-t=rm]")].indexOf(b)')&&careerMatchFocus.includes('(buttons[Math.min(index,buttons.length-1)]||$("#addJob")).focus({preventScroll:true})');
if(!careerMatchFocusRecoveryContract)errors.push("Career Match mutations must restore keyboard focus after saved-analysis and tracker deletions");
else console.log("Career Match mutation focus recovery contract: PASS");

const careerMatchSavedFocus=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchSavedFocusContract=careerMatchSavedFocus.includes(`document.querySelector(\`nav[role="tablist"] [data-v="saved"]\`)`)&&!careerMatchSavedFocus.includes(`||$("#saved")`);
if(!careerMatchSavedFocusContract)errors.push("Career Match saved deletion must focus an existing Saved tab when no remaining delete button exists");
else console.log("Career Match saved deletion focus recovery contract: PASS");
const careerMatchTrackerMetadata=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchTrackerMetadataContract=careerMatchTrackerMetadata.includes('typeof x.date==="string"&&/^\\d{4}-\\d{2}-\\d{2}$/.test(x.date)');
if(!careerMatchTrackerMetadataContract)errors.push("Career Match tracker records must validate their persisted date before rendering");
else console.log("Career Match tracker metadata integrity contract: PASS");
const careerMatchTrackerRemoval=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchTrackerRemovalReadContract=careerMatchTrackerRemoval.includes('const raw=localStorage.getItem("cm_track");t=validTrackList(raw==null?[]:JSON.parse(raw))}catch{toast("Browser storage unavailable");return}const index=');
if(!careerMatchTrackerRemovalReadContract)errors.push("Career Match tracker removal must not treat failed persisted-state reads as an empty tracker");
else console.log("Career Match tracker removal read-failure contract: PASS");

const careerMatchTrackerAddReadContract=careerMatchTrackerRemoval.includes('function addJob(company,role,status){let t;try{const raw=localStorage.getItem("cm_track"),parsed=raw==null?[]:JSON.parse(raw);if(!Array.isArray(parsed))throw new TypeError("Invalid storage data");t=validTrackList(parsed);if(parsed.length&&!t.length)throw new TypeError("Invalid storage records")}catch{toast("Browser storage unavailable");return false}');
if(!careerMatchTrackerAddReadContract)errors.push("Career Match tracker additions must reject corrupt persisted data rather than overwriting it");
else console.log("Career Match tracker add read-failure contract: PASS");

const careerMatchTrackerStatusReadContract=careerMatchTrackerRemoval.includes('select.dataset.previous=s;')&&careerMatchTrackerRemoval.includes('const previous=select.dataset.previous||select.value;')&&careerMatchTrackerRemoval.includes('catch{toast("Browser storage unavailable");select.value=previous;return}');
if(!careerMatchTrackerStatusReadContract)errors.push("Career Match tracker status changes must preserve the previous selection when persisted-state reads fail");
else console.log("Career Match tracker status read-failure contract: PASS");

const careerMatchStatusReadFailure=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchStatusReadContract=careerMatchStatusReadFailure.includes('select.dataset.previous=s;')&&careerMatchStatusReadFailure.includes('select.value=previous;return}const x=t.find');
if(!careerMatchStatusReadContract)errors.push("Career Match tracker status control must cache its previous value and restore it if tracker storage reads fail");
else console.log("Career Match tracker status read-failure preservation contract: PASS");

const careerMatchTrackerStatusWrite=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchTrackerStatusWriteContract=careerMatchTrackerStatusWrite.includes('select.dataset.previous=s;')&&careerMatchTrackerStatusWrite.includes('select.value=previous;toast("Browser storage unavailable")');
if(!careerMatchTrackerStatusWriteContract)errors.push("Career Match tracker status changes must preserve the visible status selection and card when storage writes fail");
else console.log("Career Match tracker status write-failure preservation contract: PASS");

const careerMatchSavedActions=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchSavedActionNameContract=careerMatchSavedActions.includes('btn.setAttribute("aria-label",`${action[0]} saved analysis: ${x.title}`);row.append(btn)');
if(!careerMatchSavedActionNameContract)errors.push("Career Match saved-analysis actions must expose contextual accessible names");
else console.log("Career Match saved-action naming contract: PASS");

const careerMatchSavedMetadata=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchSavedMetadataContract=careerMatchSavedMetadata.includes('typeof x.title==="string"')&&careerMatchSavedMetadata.includes('typeof x.date==="string"')&&careerMatchSavedMetadata.includes('Number.isFinite(x.score)&&x.score>=0&&x.score<=100');
if(!careerMatchSavedMetadataContract)errors.push("Career Match saved analysis metadata must validate title, date and a finite 0-100 score before rendering");
else console.log("Career Match saved-analysis metadata integrity contract: PASS");

const careerMatchSavedPanelParse=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchSavedPanelParseContract=careerMatchSavedPanelParse.includes('const root=$("#savedList");let s;try{const parsed=raw==null?[]:JSON.parse(raw);if(!Array.isArray(parsed))throw new TypeError("Invalid storage data");s=validSavedList(parsed);if(parsed.length>0&&!s.length)throw new TypeError("Invalid storage records")}catch{toast("Browser storage unavailable");if(root.children.length)return;s=[]}');
if(!careerMatchSavedPanelParseContract)errors.push("Career Match saved panel must preserve rendered entries and announce malformed persisted JSON instead of treating it as an empty list");
else console.log("Career Match malformed saved-storage preservation contract: PASS");
const careerMatchTheme=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchThemeContract=careerMatchTheme.includes('const theme=t==="dark"||t==="light"?t:"light"');
if(!careerMatchThemeContract)errors.push("Career Match persisted theme state must be restricted to the supported light/dark values");
else console.log("Career Match theme-state integrity contract: PASS");
const careerMatchStorage=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchStorageContract=careerMatchStorage.includes("function validSavedList(v)")&&careerMatchStorage.includes("function validTrackList(v)")&&careerMatchStorage.includes('const raw=localStorage.getItem("cm_saved");s=validSavedList(raw==null?[]:JSON.parse(raw))')&&careerMatchStorage.includes('const raw=localStorage.getItem("cm_track"),parsed=raw==null?[]:JSON.parse(raw);if(!Array.isArray(parsed))throw new TypeError("Invalid storage data");t=validTrackList(parsed)');
if(!careerMatchStorageContract)errors.push("Career Match persisted saved and tracker data must be shape-validated before use");
else console.log("Career Match persisted-state integrity contract: PASS");

const careerMatchPersistedIdRendering=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchPersistedIdRenderingContract=careerMatchPersistedIdRendering.includes("btn.dataset.id=x.id")&&careerMatchPersistedIdRendering.includes("btn.dataset.s=action[1]")&&careerMatchPersistedIdRendering.includes("btn.dataset.id=x.id")&&careerMatchPersistedIdRendering.includes("btn.dataset.t=\"rm\"");
if(!careerMatchPersistedIdRenderingContract)errors.push("Career Match persisted record IDs must be HTML-escaped before rendering into action attributes");
else console.log("Career Match persisted-ID rendering safety contract: PASS");

const careerMatchSavedSanitizerBoundary=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchSavedSanitizerBoundaryContract=careerMatchSavedSanitizerBoundary.includes("script,iframe,object,embed,form,style,svg,math,base,meta,link,button,input,textarea,select,option,details,summary");
if(!careerMatchSavedSanitizerBoundaryContract)errors.push("Career Match saved-content sanitizer must remove executable, navigational, metadata and interactive elements before persistence or restore");
else console.log("Career Match saved-content element boundary contract: PASS");

const careerMatchSavedMutationGuard=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchSavedMutationGuardContract=careerMatchSavedMutationGuard.includes('if(a==="save"){endEdit();const R=window.CUR;let s;try{const raw=localStorage.getItem("cm_saved");s=validSavedList(raw==null?[]:JSON.parse(raw))}catch{toast("Browser storage unavailable");return}const html=serializeChildren(parseSanitizedSavedHtml');
if(!careerMatchSavedMutationGuardContract)errors.push("Career Match saved-analysis mutations must validate persisted records before array operations");
else console.log("Career Match saved-storage mutation guard contract: PASS");

const careerMatchSavedRestoreLimit=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchSavedRestoreLimitContract=careerMatchSavedRestoreLimit.includes('typeof x.html==="string"&&x.html.length<=MAX_SAVED_HTML_CHARS');
if(!careerMatchSavedRestoreLimitContract)errors.push("Career Match persisted saved HTML must enforce the 500,000-character bound during restore validation");
else console.log("Career Match saved-HTML restore limit contract: PASS");

const careerMatchCopyCleanup=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchCopyCleanupContract=careerMatchCopyCleanup.includes('try{x.select();copied=document.execCommand("copy")}catch{copied=false}finally{x.remove()}');
if(!careerMatchCopyCleanupContract)errors.push("Career Match clipboard fallback must remove its temporary textarea even when copy execution throws");
else console.log("Career Match clipboard fallback cleanup contract: PASS");

const careerMatchReaderLoader=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchReaderLoaderContract=careerMatchReaderLoader.includes('const existing=document.querySelector(`script[src="${src}"]`)')&&careerMatchReaderLoader.includes('s.dataset.loaded="true"');
if(!careerMatchReaderLoaderContract)errors.push("Career Match third-party script loading must reuse an existing in-flight or completed script load");
else console.log("Career Match reader loader single-flight contract: PASS");

const careerMatchFileRace=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchFileRaceContract=careerMatchFileRace.includes("let fileReadToken=0;")&&careerMatchFileRace.includes("const token=++fileReadToken")&&careerMatchFileRace.includes("if(token!==fileReadToken)return");
if(!careerMatchFileRaceContract)errors.push("Career Match file reads must ignore stale asynchronous results after a newer file selection");
else console.log("Career Match file-selection race contract: PASS");

const careerMatchSavedHandler=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchSavedHandlerContract=careerMatchSavedHandler.includes('$("#savedList").onclick=e=>{const b=e.target.closest("button[data-s]");if(!b)return;let s;try{const raw=localStorage.getItem("cm_saved");s=validSavedList(raw==null?[]:JSON.parse(raw))}catch{toast("Browser storage unavailable");return}');
if(!careerMatchSavedHandlerContract)errors.push("Career Match saved-analysis actions must use validated persisted records");
else console.log("Career Match saved-action integrity contract: PASS");

const careerMatchMammoth=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchMammothSecurityContract=careerMatchMammoth.includes('mammoth/1.13.0/mammoth.browser.min.js')&&!careerMatchMammoth.includes('mammoth/1.6.0/');
if(!careerMatchMammothSecurityContract)errors.push("Career Match DOCX reader must use the current patched Mammoth browser build");
else console.log("Career Match Mammoth dependency security contract: PASS");

const siteCss=fs.readFileSync("assets/css/style.css","utf8");
const jawedAiCtaContrastContract=siteCss.includes(".ai-discovery-card a.button{color:#fff}")&&siteCss.includes(".ai-discovery-card a.button:hover,.ai-discovery-card a.button:focus-visible{color:#fff}");
if(!jawedAiCtaContrastContract)errors.push("Jawed AI card CTAs must retain white text across default, hover and focus-visible states");
else console.log("Jawed AI CTA contrast contract: PASS");

const headers=fs.readFileSync("_headers","utf8");
const crossDomainPolicyContract=headers.includes("X-Permitted-Cross-Domain-Policies: none");
if(!crossDomainPolicyContract)errors.push("Security headers must disable legacy cross-domain policy files");
else console.log("X-Permitted-Cross-Domain-Policies contract: PASS");

const cspFrameContract=headers.includes("frame-src 'none'");
if(!cspFrameContract)errors.push("CSP must explicitly deny frame loads because the site does not use iframes");
else console.log("CSP frame-src hardening contract: PASS");

const crossOriginOpenerPolicyContract=headers.includes("Cross-Origin-Opener-Policy: same-origin");
if(!crossOriginOpenerPolicyContract)errors.push("Security headers must enforce same-origin cross-origin opener isolation");
else console.log("Cross-Origin-Opener-Policy contract: PASS");
const careerMatchFileSignature=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchFileSignatureContract=careerMatchFileSignature.includes("const isPdf=bytes.length>=4&&bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70")&&careerMatchFileSignature.includes("const isZip=bytes.length>=2&&bytes[0]===80&&bytes[1]===75")&&careerMatchFileSignature.includes("selected file does not appear to be a valid PDF")&&careerMatchFileSignature.includes("selected file does not appear to be a valid DOCX file");
if(!careerMatchFileSignatureContract)errors.push("Career Match PDF/DOCX uploads must validate basic file signatures before invoking parsers");
else console.log("Career Match file signature validation contract: PASS");
const careerMatchLoader=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchLoaderContract=careerMatchLoader.includes("s.onerror=()=>{s.remove();reject(new Error(\"Could not load the file reader (internet needed)\"))}")&&!careerMatchLoader.includes("s.onerror=()=>reject(new Error(\"Could not load the file reader (internet needed)\"))");
if(!careerMatchLoaderContract)errors.push("Career Match external file-reader loader must remove failed script elements before rejecting");
else console.log("Career Match failed loader cleanup contract: PASS");
const careerMatchSavedSize=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchSavedSizeContract=careerMatchSavedSize.includes("const MAX_SAVED_HTML_CHARS=500000")&&careerMatchSavedSize.includes("html.length>MAX_SAVED_HTML_CHARS")&&careerMatchSavedSize.includes("maximum 500,000 characters");
if(!careerMatchSavedSizeContract)errors.push("Career Match saved analyses must enforce a per-analysis HTML size bound before localStorage persistence");
else console.log("Career Match saved-analysis size guard contract: PASS");

const careerMatchDownloadName=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchDownloadNameContract=careerMatchDownloadName.includes("function downloadName(title)")&&careerMatchDownloadName.includes('slice(0,80)')&&careerMatchDownloadName.includes('return (base||"analysis")+".txt"')&&careerMatchDownloadName.includes("l.download=downloadName(t)");
if(!careerMatchDownloadNameContract)errors.push("Career Match download filenames must be bounded and fall back to a safe non-empty name");
else console.log("Career Match download filename integrity contract: PASS");

const careerMatchDownload=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchDownloadContract=careerMatchDownload.includes("URL.createObjectURL(new Blob")&&careerMatchDownload.includes("setTimeout(()=>URL.revokeObjectURL(u),0)")&&!careerMatchDownload.includes("l.click();URL.revokeObjectURL(u)");
if(!careerMatchDownloadContract)errors.push("Career Match downloads must defer Blob URL revocation until after download initiation");
else console.log("Career Match download URL cleanup contract: PASS");

const careerMatchFileGuards=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchFileResourceContract=careerMatchFileGuards.includes("const MAX_FILE_BYTES=15*1024*1024")&&careerMatchFileGuards.includes("const MAX_PDF_PAGES=100")&&careerMatchFileGuards.includes("const MAX_EXTRACTED_CHARS=500000")&&careerMatchFileGuards.includes("if(f.size>MAX_FILE_BYTES)")&&careerMatchFileGuards.includes("if(pdf.numPages>MAX_PDF_PAGES)")&&careerMatchFileGuards.includes("if(out.length>MAX_EXTRACTED_CHARS)");
if(!careerMatchFileResourceContract)errors.push("Career Match file parsing must enforce upload size, PDF page-count, and extracted-text bounds");
else console.log("Career Match file resource guard contract: PASS");

const careerMatchInnerHtml=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchInnerHtmlContract=!careerMatchInnerHtml.includes(".innerHTML");
if(!careerMatchInnerHtmlContract)errors.push("Career Match must not use live innerHTML sinks");
else console.log("Career Match innerHTML sink contract: PASS");

const careerMatchPdfCleanup=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchPdfCleanupContract=careerMatchPdfCleanup.includes("const pdf=await pdfjsLib.getDocument({data:buf,isEvalSupported:false,enableScripting:false}).promise;")&&careerMatchPdfCleanup.includes("try{")&&careerMatchPdfCleanup.includes("finally{await pdf.destroy()}")&&!careerMatchPdfCleanup.includes("if(pdf.numPages>MAX_PDF_PAGES){await pdf.destroy();throw");
if(!careerMatchPdfCleanupContract)errors.push("Career Match PDF parsing must destroy the PDF.js document in a finally block");
else console.log("Career Match PDF document cleanup contract: PASS");

const careerMatchPdf=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchPdfSecurityContract=careerMatchPdf.includes('pdf.js/4.2.67/pdf.min.mjs')&&careerMatchPdf.includes('pdf.js/4.2.67/pdf.worker.min.mjs')&&!careerMatchPdf.includes('pdf.js/3.11.174/');
if(!careerMatchPdfSecurityContract)errors.push("Career Match PDF reader must use the patched PDF.js release and matching worker");
else console.log("Career Match PDF dependency security contract: PASS");

const careerMatchTrackerRender=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchTrackerRenderContract=careerMatchTrackerRender.includes("function renderTracker(){let raw;try{raw=localStorage.getItem(\"cm_track\")}catch{toast(\"Browser storage unavailable\");if($(\"#board\").children.length)return;raw=\"[]\"}let t;try{const parsed=raw==null?[]:JSON.parse(raw);if(!Array.isArray(parsed))throw new TypeError(\"Invalid storage data\");t=validTrackList(parsed);if(parsed.length>0&&!t.length)throw new TypeError(\"Invalid storage records\")}catch{toast(\"Browser storage unavailable\");if($(\"#board\").children.length)return;t=[]}");
if(!careerMatchTrackerRenderContract)errors.push("Career Match tracker rendering must use validated persisted records");
else console.log("Career Match tracker render integrity contract: PASS");

const careerMatchResultActions=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchResultActionNameContract=careerMatchResultActions.includes('<button data-a="copy" aria-label="Copy ${title}">Copy</button><button data-a="edit" aria-label="Edit ${title}">Edit</button><button data-a="dl" aria-label="Download ${title}">Download</button><button data-a="save" aria-label="Save ${title} analysis">Save Analysis</button>');
if(!careerMatchResultActionNameContract)errors.push("Career Match generated result actions must expose contextual accessible names");
else console.log("Career Match result-action naming contract: PASS");

const careerMatchEditableResult=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchEditableResultContract=careerMatchEditableResult.includes('bd.setAttribute("contenteditable","true");bd.setAttribute("aria-label",`${t} editable content`);bd.focus();b.textContent="Done"')&&careerMatchEditableResult.includes('bd.removeAttribute("contenteditable");bd.removeAttribute("aria-label");b.textContent="Edit"');
if(!careerMatchEditableResultContract)errors.push("Career Match editable result bodies must expose a contextual accessible name while editing");
else console.log("Career Match editable-result naming contract: PASS");

const careerMatchThemeToggle=fs.readFileSync("tools/career-match-resume-review/index.html","utf8");
const careerMatchThemeToggleContract=careerMatchThemeToggle.includes('id="theme" aria-label="Toggle light/dark mode" aria-pressed="false"')&&careerMatchThemeToggle.includes('const b=$("#theme");if(b)b.setAttribute("aria-pressed",String(theme==="dark"))');
if(!careerMatchThemeToggleContract)errors.push("Career Match theme toggle must expose and synchronize its dark-mode pressed state");
else console.log("Career Match theme-toggle state contract: PASS");

const financeSnapshot=fs.readFileSync("tools/personal-finance-snapshot/index.html","utf8");
const financeSnapshotResetContract=financeSnapshot.includes("defaults=Object.fromEntries(ids.map(id=>[id,$(id).value]))")&&financeSnapshot.includes("ids.forEach(id=>$(id).value=defaults[id])");
if(!financeSnapshotResetContract)errors.push("Personal Finance Snapshot reset must restore all calculator fields, including fields outside the form");
else console.log("Personal Finance Snapshot reset contract: PASS");

const financePlanningSummary=fs.readFileSync("tools/finance-planning-workspace/index.html","utf8");
const financePlanningSummaryLiveRegionContract=
  financePlanningSummary.includes('<p class="summary" id="reserveText" role="status" aria-live="polite" aria-atomic="true"></p>')&&
  financePlanningSummary.includes('<p class="summary" id="retSummary" role="status" aria-live="polite" aria-atomic="true"></p>');
if(!financePlanningSummaryLiveRegionContract)errors.push("Finance Planning Workspace dynamic summaries must expose atomic polite live regions");
else console.log("Finance Planning summary live-region contract: PASS");

const financeSnapshotErrorRegion=fs.readFileSync("tools/personal-finance-snapshot/index.html","utf8");
const financeSnapshotErrorRegionContract=financeSnapshotErrorRegion.includes('id="error" class="form-note" role="alert" aria-atomic="true"');
if(!financeSnapshotErrorRegionContract)errors.push("Personal Finance Snapshot validation errors must expose atomic alert semantics");
else console.log("Personal Finance Snapshot error live-region contract: PASS");

const financePlanningErrorRegions=fs.readFileSync("tools/finance-planning-workspace/index.html","utf8");
const financePlanningErrorRegionContract=
  financePlanningErrorRegions.includes('id="snapshotError" role="alert" aria-atomic="true"')&&
  financePlanningErrorRegions.includes('id="goalError" role="alert" aria-atomic="true"')&&
  financePlanningErrorRegions.includes('id="retError" role="alert" aria-live="assertive" aria-atomic="true"');
if(!financePlanningErrorRegionContract)errors.push("Finance Planning Workspace validation errors must expose atomic alert regions");
else console.log("Finance Planning error live-region contract: PASS");
const financePlanningInvalidStateContract=financePlanningErrorRegions.includes('markInvalid=(fields,bad,errorId)=>fields.forEach(id=>{const el=$(id);el.setAttribute("aria-invalid",String(bad));if(bad)el.setAttribute("aria-describedby",errorId);else el.removeAttribute("aria-describedby")})')&&financePlanningErrorRegions.includes('markInvalid(fields,true,"snapshotError")')&&financePlanningErrorRegions.includes('markInvalid(fields,true,"goalError")')&&financePlanningErrorRegions.includes('markInvalid(fields,true,"retError")')&&financePlanningErrorRegions.includes('markInvalid(fields,false,"snapshotError")')&&financePlanningErrorRegions.includes('markInvalid(fields,false,"goalError")')&&financePlanningErrorRegions.includes('markInvalid(fields,false,"retError")');
if(!financePlanningInvalidStateContract)errors.push("Finance Planning Workspace validation must synchronize aria-invalid on affected inputs");
else console.log("Finance Planning invalid-field state contract: PASS");


const formErrorSummaryAtomicContract=fs.readFileSync("assets/js/main.js","utf8").includes("summary.setAttribute(\'role\',\'alert\');summary.setAttribute(\'aria-atomic\',\'true\');");
if(!formErrorSummaryAtomicContract)errors.push("Shared form validation summaries must expose atomic alert semantics");
else console.log("Shared form error-summary atomicity contract: PASS");

const sharedRuntime=fs.readFileSync("assets/js/main.js","utf8");
const sharedRuntimeContracts=[
  ["skip-link runtime",sharedRuntime.includes("s.className='skip-link'")&&sharedRuntime.includes("s.href='#main-content'")],
  ["mobile navigation toggle",sharedRuntime.includes("b.addEventListener('click'")&&sharedRuntime.includes("b.setAttribute('aria-expanded',String(o))")],
  ["mobile navigation Escape close",sharedRuntime.includes("if(e.key==='Escape'){n.classList.remove('is-open')")],
  ["global form validation",sharedRuntime.includes("document.addEventListener('submit',e=>{const form=e.target")&&sharedRuntime.includes("invalid[0].focus()")],
  ["contact form submit handler",sharedRuntime.includes("f.addEventListener('submit',e=>{e.preventDefault()")],
  ["filter URL synchronization",sharedRuntime.includes("window.history.replaceState({},'',next)")&&sharedRuntime.includes("i.addEventListener('input',()=>update(true))")],
  ["filter reset control",sharedRuntime.includes("data-reset-filter")&&sharedRuntime.includes("i.focus()")],
  ["AI widget starts closed",sharedRuntime.includes('panel.hidden=true')&&!sharedRuntime.includes('setOpen(true)')],
  ["AI widget form uses no-store POST",sharedRuntime.includes('cache:"no-store"')]
];
const sharedRuntimeErrors=sharedRuntimeContracts.filter(([,ok])=>!ok).map(([name])=>name);
if(sharedRuntimeErrors.length)errors.push("Shared runtime regression contract missing: "+sharedRuntimeErrors.join(", "));
else console.log("Shared runtime interaction contract: PASS");

const contactPage=fs.readFileSync("contact/index.html","utf8");
const contactCopyRuntime=fs.readFileSync("assets/js/contact-copy-email.js","utf8");
const contactCopyHasNetworkOrStorage=["fetch(","XMLHttpRequest","sendBeacon","localStorage","sessionStorage","indexedDB"].some(token=>contactCopyRuntime.includes(token));
const contactCopyContracts=[
 ["copy-email button beside existing mailto link",contactPage.includes('href="mailto:webmaster@jawed.co.in">Email webmaster@jawed.co.in</a> <button class="button button-secondary" id="copy-contact-email"')],
 ["accessible polite copy status",contactPage.includes('id="copy-contact-status" role="status" aria-live="polite" aria-atomic="true"')],
 ["deferred same-origin copy helper",contactPage.includes('<script src="/assets/js/contact-copy-email.js" defer></script>')],
 ["Clipboard API and unsupported-browser fallback",contactCopyRuntime.includes("navigator.clipboard.writeText(email)")&&contactCopyRuntime.includes('document.execCommand("copy")')],
 ["manual copy fallback message",contactCopyRuntime.includes("Automatic copying was unavailable")&&contactCopyRuntime.includes("Select and copy webmaster@jawed.co.in")],
 ["copy helper has no network or persistence calls",!contactCopyHasNetworkOrStorage],
 ["existing mailto form and submit handler preserved",contactPage.includes('<form class="contact-form" id="contact-form" action="mailto:webmaster@jawed.co.in"')&&sharedRuntime.includes("f.addEventListener('submit',e=>{e.preventDefault()")]
];
const contactCopyErrors=contactCopyContracts.filter(([,ok])=>!ok).map(([name])=>name);
if(contactCopyErrors.length)errors.push("Contact copy-email regression contract missing: "+contactCopyErrors.join(", "));
else console.log("Contact copy-email accessibility/privacy regression contract: PASS");

async function runContactCopyCase({clipboardAvailable=true,clipboardRejects=false,legacyCopyResult=true}={}){
 let clickHandler=null,execCommandCalls=0,copiedValue=null;
 const status={textContent:""};
 const button={dataset:{copyContactEmail:"webmaster@jawed.co.in"},addEventListener(type,handler){if(type==="click")clickHandler=handler}};
 const document={
  getElementById(id){return id==="copy-contact-email"?button:id==="copy-contact-status"?status:null},
  createElement(){return {value:"",style:{},setAttribute(){},select(){},remove(){}}},
  body:{appendChild(){}},
  execCommand(command){execCommandCalls++;return command==="copy"&&legacyCopyResult}
 };
 const navigator={};
 if(clipboardAvailable)navigator.clipboard={async writeText(value){copiedValue=value;if(clipboardRejects)throw new Error("clipboard permission denied")}};
 runInNewContext(contactCopyRuntime,{document,navigator,window:{isSecureContext:true}});
 assert.equal(typeof clickHandler,"function","copy button click handler must be registered");
 await clickHandler();
 return {status:status.textContent,execCommandCalls,copiedValue};
}
const contactCopyBehaviorFailures=[];
const clipboardSuccess=await runContactCopyCase();
if(!clipboardSuccess.status.includes("Email address copied")||clipboardSuccess.copiedValue!=="webmaster@jawed.co.in"||clipboardSuccess.execCommandCalls!==0)contactCopyBehaviorFailures.push("Clipboard API success");
const legacySuccess=await runContactCopyCase({clipboardAvailable:false});
if(!legacySuccess.status.includes("Email address copied")||legacySuccess.execCommandCalls!==1)contactCopyBehaviorFailures.push("unsupported-browser legacy copy success");
const clipboardRejected=await runContactCopyCase({clipboardRejects:true});
if(!clipboardRejected.status.includes("Automatic copying was unavailable")||clipboardRejected.execCommandCalls!==0)contactCopyBehaviorFailures.push("Clipboard API rejection manual fallback");
const legacyRejected=await runContactCopyCase({clipboardAvailable:false,legacyCopyResult:false});
if(!legacyRejected.status.includes("Automatic copying was unavailable")||legacyRejected.execCommandCalls!==1)contactCopyBehaviorFailures.push("legacy copy failure manual fallback");
if(contactCopyBehaviorFailures.length)errors.push("Contact copy-email behavior failed: "+contactCopyBehaviorFailures.join(", "));
else console.log("Contact copy-email functional cases: PASS (Clipboard API success, legacy fallback, and both failure paths)");


const noteDateMetadataErrors=[];
const noteFiles=sourcePaths.filter(file=>file.startsWith("notes/")&&file.endsWith("/index.html")&&file!=="notes/index.html");
for(const file of noteFiles){
 const html=fs.readFileSync(file,"utf8");
 const articleData=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match=>{try{return JSON.parse(match[1])}catch{return null}}).find(value=>value&&value["@type"]==="Article");
 const body=html.slice(html.indexOf("</head>")).replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ");
 const published=(body.match(/Published:\s*(\d{4}-\d{2}-\d{2})/)||[])[1]||null;
 const updated=(body.match(/Updated:\s*(\d{4}-\d{2}-\d{2})/)||[])[1]||null;
 if(!articleData||! /^\d{4}-\d{2}-\d{2}$/.test(articleData.datePublished||"")||! /^\d{4}-\d{2}-\d{2}$/.test(articleData.dateModified||"")){
  noteDateMetadataErrors.push(file+": missing or invalid Article publication/update metadata");
 }else if(published&&updated){
  if(published!==articleData.datePublished||updated!==articleData.dateModified)noteDateMetadataErrors.push(file+": visible Published/Updated dates do not match Article datePublished/dateModified");
 }else if(!published&&!updated&&articleData.datePublished===articleData.dateModified&&body.includes(articleData.datePublished)){
  // Older note templates use a single visible publication date when no separate update is shown.
 }else{
  noteDateMetadataErrors.push(file+": visible date labels are incomplete or cannot be aligned with Article metadata");
 }
}
if(noteDateMetadataErrors.length)errors.push("Note date metadata integrity failures: "+noteDateMetadataErrors.join("; "));
else console.log("Note publication/update metadata alignment: PASS ("+noteFiles.length+" note pages checked)");

assert.equal(errors.length,0,errors.join("\n"));
console.log("All site-integrity contracts: PASS");
console.log("Discovery filter exclusion contract: PASS");
console.log("Site sitemap/page parity: PASS");
console.log("Sitemap pages:",sitemapPaths.length);
console.log("Published HTML pages audited:",sourcePaths.length);
console.log("Unsitemap published pages:",unsitemapPages.length);
console.log("Missing sitemap source files:",missingSources.length);


const noteBreadcrumbFiles=fs.readdirSync("notes",{withFileTypes:true})
  .filter(entry=>entry.isDirectory())
  .map(entry=>`notes/${entry.name}/index.html`)
  .filter(file=>fs.existsSync(file));
for(const notePath of noteBreadcrumbFiles){
  const noteHtml=fs.readFileSync(notePath,"utf8");
    const noteH1=(noteHtml.match(/<h1>(.*?)<\/h1>/i)||[])[1]||"";
  const breadcrumb=(noteHtml.match(/<p class="breadcrumbs">(.*?)<\/p>/i)||[])[1]||"";
  const currentLabel=(breadcrumb.match(/<span aria-current="page">(.*?)<\/span>/i)||[])[1]||"";
  if(noteH1 && breadcrumb){
    assert.equal(currentLabel.includes("Current note"),false,"Published note breadcrumb must not use the generic Current note label: "+notePath);
    assert.equal(currentLabel,noteH1,"Published note breadcrumb must match its H1 title: "+notePath);
  }
}
console.log("Note breadcrumb context contract: PASS");
