#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const audit=fs.readFileSync("docs/adsense-content-readiness.md","utf8");
const inventory=JSON.parse(fs.readFileSync("config/adsense-inventory.json","utf8"));

const publishedSitemap=fs.readFileSync("sitemap.xml","utf8");
const publishedRoutes=publishedSitemap.split("<loc>").slice(1).map(entry=>{
  const url=entry.split("</loc>")[0];
  const withoutProtocol=url.replace("https://","").replace("http://","");
  const slashIndex=withoutProtocol.indexOf("/");
  return slashIndex<0?"/":withoutProtocol.slice(slashIndex);
});
const citationPlaceholderPattern=new RegExp("turn0search[0-9]+|cite|");
const toolData=fs.readFileSync("src/data/toolsData.ts","utf8");
const registeredToolSlugs=new Set([...toolData.matchAll(/slug:\s*'([^']+)'/g)].map(match=>match[1]));
for(const routePath of publishedRoutes){
  const toolRoute=routePath.match(/^\/tools\/([^/]+)\/$/);
  if(toolRoute&&registeredToolSlugs.has(toolRoute[1]))continue;
  const routeWithoutLeadingSlash=routePath.startsWith("/")?routePath.slice(1):routePath;
  const normalizedRoute=routeWithoutLeadingSlash.endsWith("/")?routeWithoutLeadingSlash.slice(0,-1):routeWithoutLeadingSlash;
  const sourcePath=routePath==="/"?"index.html":normalizedRoute+"/index.html";
  assert.equal(fs.existsSync(sourcePath),true,"Published route has no static source or registered React tool route: "+routePath);
  const publishedHtml=fs.readFileSync(sourcePath,"utf8");
  assert.equal(citationPlaceholderPattern.test(publishedHtml),false,"Published page exposes internal citation placeholders: "+sourcePath);
}

for(const route of ["/","/about/","/work/","/notes/","/topics/","/resources/","/blog/"])assert.equal(inventory.eligible_initial.includes(route),true,"Eligible content route missing from inventory: "+route);
for(const route of ["/ai/","/tools/","/contact/","/privacy/"])assert.equal(inventory.excluded_initial.includes(route),true,"Excluded route missing from inventory: "+route);
assert.equal(audit.includes("This is a site-specific readiness assessment, not a Google approval or policy determination."),true,"Audit must preserve its non-approval limitation");
assert.equal(audit.includes("Ads should initially be restricted to the approved inventory boundary"),true,"Audit must bind activation to the inventory boundary");
assert.equal(audit.includes("interactive AI surface"),true,"AI exclusion rationale is missing");
assert.equal(audit.includes("interactive utilities"),true,"Tool exclusion rationale is missing");
assert.equal(audit.includes("original long-form writing"),true,"Blog content assessment is missing");

const knowledgeBase=fs.readFileSync("notes/it-troubleshooting-guide-knowledge-base/index.html","utf8");
for(const phrase of [
  "Worked example: turn one ticket into a reusable guide",
  "Illustrative example only; not a record of a real user or employer.",
  "The cause has not been confirmed.",
  "Do not state that the password reset caused the failure.",
  "Confirm the user can complete the original VPN connection workflow"
])assert.equal(knowledgeBase.includes(phrase),true,"Knowledge-base worked-example contract missing: "+phrase);

const retirementWithdrawals=fs.readFileSync("notes/retirement-withdrawals-sequence-risk-income-review/index.html","utf8");
for(const phrase of [
  "Retirement Withdrawals: Sequence Risk, Income and Annual Reviews",
  "Why the sequence of returns matters",
  "Map the funding gap before choosing a withdrawal approach",
  "Suppose a hypothetical household estimates annual retirement spending of ₹9 lakh",
  "initial gap to plan for is ₹6 lakh a year",
  "Both paths contain a 20% gain and a 20% loss.",
  "PFRDA NPS All Citizen Model information",
  "Investor.gov retirement income guidance",
  "Financial Content Disclosure"
])assert.equal(retirementWithdrawals.includes(phrase),true,"Retirement withdrawal guide contract missing: "+phrase);
const startPortfolio=100,annualWithdrawal=10;
const gainThenLoss=(startPortfolio*1.2-annualWithdrawal)*0.8-annualWithdrawal;
const lossThenGain=(startPortfolio*0.8-annualWithdrawal)*1.2-annualWithdrawal;
assert.equal(gainThenLoss,78,"Gain-then-loss illustrative sequence arithmetic changed");
assert.equal(lossThenGain,74,"Loss-then-gain illustrative sequence arithmetic changed");
const annualSpending=9,dependableIncome=3;
assert.equal(annualSpending-dependableIncome,6,"Retirement funding-gap example arithmetic changed");
assert.equal(retirementWithdrawals.includes("₹9 lakh − ₹3 lakh"),true,"Published retirement funding-gap arithmetic must be visible");
assert.equal(retirementWithdrawals.includes("₹6 lakh a year"),true,"Published retirement funding gap must match independent arithmetic");
assert.equal(retirementWithdrawals.includes("Published: 2026-10-12 · Updated: 2026-10-13 · 8 min read"),true,"Retirement withdrawal visible update date must match substantive change");
assert.equal(retirementWithdrawals.includes('"dateModified":"2026-10-13"'),true,"Retirement withdrawal schema modified date must match visible update date");
assert.equal(retirementWithdrawals.includes("₹78L")&&retirementWithdrawals.includes("₹74L"),true,"Published sequence-risk example must match its independently calculated outcomes");
assert.equal(retirementWithdrawals.includes("/notes/retirement-corpus-calculation-framework/"),true,"Withdrawal guide must link to the corpus framework");
assert.equal(retirementWithdrawals.includes("/tools/retirement-planning-calculator/"),true,"Withdrawal guide must link to the retirement calculator");

const portfolioGuide=fs.readFileSync("notes/portfolio-allocation-rebalancing-framework/index.html","utf8");
for(const phrase of [
  "Worked example: calculate allocation drift",
  "Current allocation weight = current value of the asset category",
  "₹10 lakh portfolio",
  "+8 percentage points",
  "−8 percentage points",
  "does not, by itself, tell you that a trade is required.",
  "Financial Content Disclosure"
])assert.equal(portfolioGuide.includes(phrase),true,"Portfolio allocation worked-example contract missing: "+phrase);
assert.equal(portfolioGuide.includes('dateModified":"2026-10-12"'),true,"Portfolio allocation Article dateModified must match the visible update date");

const usInvestingGuide=fs.readFileSync("notes/us-stocks-etfs-starting-point/index.html","utf8");
for(const phrase of [
  "Worked example: two ETFs can still overlap",
  "Company X",
  "₹2.5 lakh (25%)",
  "₹2.0 lakh (20%)",
  "₹4.5 lakh (45%)",
  "not proof of diversification",
  "Financial Content Disclosure"
])assert.equal(usInvestingGuide.includes(phrase),true,"US stocks/ETF worked-example contract missing: "+phrase);
assert.equal(usInvestingGuide.includes('dateModified":"2026-10-12"'),true,"US stocks/ETF Article dateModified must match visible update date");

const taxYearGuide=fs.readFileSync("notes/indian-income-tax-practical-starting-point/index.html","utf8");
for(const phrase of [
  "Important scope update: AY 2026-27 and Tax Year 2026-27 are different periods",
  "Income-tax Act, 1961",
  "Income-tax Act, 2025",
  "Tax Year 2026-27",
  "Updated-FQAs-on-Interplay%26Transitions.pdf",
  "tax-rates-and-computation",
  "Sources checked: 2026-10-13",
  "https://www.incometax.gov.in/iec/foportal/node/11724",
  "income earned from 1 April 2026 onward"
])assert.equal(taxYearGuide.includes(phrase),true,"Tax-year transition guidance missing: "+phrase);
assert.equal(taxYearGuide.includes('"dateModified":"2026-10-13"'),true,"Tax guide schema modified date must match the review date");
assert.equal(taxYearGuide.includes("Sources checked: 2026-10-12"),false,"Tax source date must reflect the current source review");
const taxRegimeComparison=fs.readFileSync("notes/new-vs-old-tax-regime-comparison/index.html","utf8");
for(const phrase of [
  "Check the tax year before using this comparison",
  "Income-tax Act, 1961",
  "Income-tax Act, 2025",
  "Tax Year 2026-27",
  "Updated-FQAs-on-Interplay%26Transitions.pdf",
  "tax-rates-and-computation",
  "Sources checked: 2026-10-13",
  "https://www.incometaxindia.gov.in/Documents/Budget2026/FAQs-Budget-2026.pdf",
  "rather than carrying this page's old-Act section references forward"
])assert.equal(taxRegimeComparison.includes(phrase),true,"Tax regime comparison transition guidance missing: "+phrase);
assert.equal(taxRegimeComparison.includes('"dateModified":"2026-10-13"'),true,"Tax regime comparison schema date must match source review");
assert.equal(taxRegimeComparison.includes("Sources checked: 2026-10-12"),false,"Tax comparison source date must reflect the current source review");




const inflationGoalGuide=fs.readFileSync("notes/inflation-and-future-goal-planning/index.html","utf8");
for(const phrase of [
  "Official reference and scope",
  "esankhyiki.mospi.gov.in/catalogue-main/catalogue?product=CPI",
  "4%:</strong> approximately ₹14.80 lakh",
  "6%:</strong> approximately ₹17.91 lakh",
  "8%:</strong> approximately ₹21.59 lakh",
  "These are sensitivity scenarios, not predictions",
  "Source checked: 2026-10-13",
  "Published: 2026-09-28 · Updated: 2026-10-13 · 6 min read",
  '"dateModified":"2026-10-13"',
  "Financial Content Disclosure"
])assert.equal(inflationGoalGuide.includes(phrase),true,"Inflation sensitivity/source contract missing: "+phrase);
assert.equal(inflationGoalGuide.includes("turn0search"),false,"Inflation guide must not expose internal citation placeholders");
const goalCostAt4=10*Math.pow(1.04,10);
const goalCostAt6=10*Math.pow(1.06,10);
const goalCostAt8=10*Math.pow(1.08,10);
assert.equal(Math.abs(goalCostAt4-14.80)<0.01,true,"4% inflation sensitivity example must remain correct");
assert.equal(Math.abs(goalCostAt6-17.91)<0.01,true,"6% inflation sensitivity example must remain correct");
assert.equal(Math.abs(goalCostAt8-21.59)<0.01,true,"8% inflation sensitivity example must remain correct");

const retirementCorpusGuide=fs.readFileSync("notes/retirement-corpus-calculation-framework/index.html","utf8");
for(const phrase of [
  "Sources and scope",
  "esankhyiki.mospi.gov.in/catalogue-main/catalogue?product=CPI",
  "pfrda.org.in/en/regulatory-framework/regulations",
  "investor.gov/additional-resources/retirement-toolkit/managing-lifetime-income",
  "not official projections",
  "Sources checked: 2026-10-13",
  "Published: 2026-09-28 · Updated: 2026-10-13 · 8 min read",
  '"dateModified":"2026-10-13"',
  "Financial Content Disclosure"
])assert.equal(retirementCorpusGuide.includes(phrase),true,"Retirement corpus source-transparency contract missing: "+phrase);
assert.equal(retirementCorpusGuide.includes("turn0search"),false,"Retirement corpus guide must not expose internal citation placeholders");
const retirementInflationProjection=6*Math.pow(1.06,15);
assert.equal(Math.abs(retirementInflationProjection-14.38)<0.01,true,"Retirement corpus inflation example must remain numerically correct");
const retirementCorpusPv=15*(1-Math.pow(1.03,-30))/0.03;
assert.equal(Math.abs(retirementCorpusPv-294.1)<0.2,true,"Retirement corpus annuity example must remain numerically correct");
const retirementRealReturn=(1.10/1.06)-1;
assert.equal(Math.abs(retirementRealReturn-0.0377358)<0.00001,true,"Retirement corpus real-return example must remain numerically correct");


const aboutCareerStory=fs.readFileSync("about/index.html","utf8");
for(const phrase of [
  "My career has moved through technical support, system administration",
  "understand what the person needs to complete",
  "determine whether the symptom follows a user, device or service",
  "does not publish employer-confidential procedures, internal systems, user records",
  'href="/work/projects/"',
  'href="/work/skills/"',
  'href="/notes/it-service-desk-troubleshooting-workflow/"',
  "not claims that a particular illustrative scenario occurred at work"
])assert.equal(aboutCareerStory.includes(phrase),true,"About career-journey context contract missing: "+phrase);

const blogIndex=fs.readFileSync("blog/index.html","utf8");
for(const phrase of [
  "How to use these posts",
  "it is not a real user or employer incident",
  "For an immediate troubleshooting sequence, start with the relevant Note.",
  "primary documentation linked in Resources",
  'href="/notes/"',
  'href="/resources/"'
])assert.equal(blogIndex.includes(phrase),true,"Blog index editorial context missing: "+phrase);

const skillsPage=fs.readFileSync("work/skills/index.html","utf8");
for(const phrase of [
  "How I apply these skills",
  "establish whether the symptoms follow a user, device or service",
  "choose a low-risk check that can distinguish likely causes",
  "not a claim of equal depth across every listed product",
  'href="/notes/it-service-desk-troubleshooting-workflow/"',
  'href="/notes/network-connectivity-first-response-checklist/"'
])assert.equal(skillsPage.includes(phrase),true,"Skills page evidence context missing: "+phrase);

const topicsPage=fs.readFileSync("topics/index.html","utf8");
assert.equal(topicsPage.includes("Active foundation"),false,"Topic hub must not expose internal placeholder labels");
for(const phrase of [
  "Start with a target",
  "/notes/retirement-corpus-calculation-framework/",
  "/notes/inflation-and-future-goal-planning/",
  "/notes/retirement-withdrawals-sequence-risk-income-review/",
  "Each guide covers a different planning question",
  "The current collection focuses on health-insurance education; it does not compare specific policies.",
  "/notes/health-insurance-understanding-the-basics/",
  "Illustrative calculators"
])assert.equal(topicsPage.includes(phrase),true,"Topic hub task-pathway contract missing: "+phrase);
assert.equal(topicsPage.includes("Retirement guides"),false,"Retirement card must not use a redundant badge instead of specific guide paths");
assert.equal(topicsPage.includes("Coverage fundamentals"),false,"Insurance card must not use a redundant badge instead of describing the collection scope");

const notesIndex=fs.readFileSync("notes/index.html","utf8");
assert.equal(notesIndex.includes('<p class="eyebrow">3 notes</p><h3>Personal Finance · Retirement</h3>'),true,"Retirement summary count must include all three published notes");
assert.equal(notesIndex.includes('<h3>Personal Finance · Retirement <span class="badge">3 notes</span></h3>'),true,"Retirement subject count must match the summary card");
for(const phrase of [
  '<h3>General Tech</h3>',
  '<a href="#subject-general-tech">View note →</a>',
  '<h3>Investing &amp; Personal Finance</h3>',
  '<a href="#subject-investing-finance">View notes →</a>'
])assert.equal(notesIndex.includes(phrase),true,"Notes subject discovery pathway missing: "+phrase);
const subjectSectionIds=[...notesIndex.matchAll(/id="(subject-[^"]+)"/g)].map(match=>match[1]);
const subjectMenuTargets=new Set([...notesIndex.matchAll(/href="#(subject-[^"]+)"/g)].map(match=>match[1]));
for(const id of subjectSectionIds)assert.equal(subjectMenuTargets.has(id),true,"Every Notes subject section must have a Browse by Subject shortcut: "+id);
for(const phrase of [
  '<h3>Tool Selection</h3>',
  '<a href="#task-tool-selection">View note →</a>',
  '<h3>Prompting</h3>',
  '<a href="#task-prompting">View note →</a>',
  '<h3>Tool Architecture</h3>',
  '<a href="#task-tool-architecture">View note →</a>',
  '<h3>Fundamentals</h3>',
  '<a href="#task-fundamentals">View note →</a>',
  '<h3>Frameworks &amp; Planning</h3>',
  '<a href="#task-finance-frameworks">View notes →</a>'
])assert.equal(notesIndex.includes(phrase),true,"Notes task discovery pathway missing: "+phrase);
const taskSectionIds=[...notesIndex.matchAll(/id="(task-[^"]+)"/g)].map(match=>match[1]);
const taskMenuTargets=new Set([...notesIndex.matchAll(/href="#(task-[^"]+)"/g)].map(match=>match[1]));
for(const id of taskSectionIds)assert.equal(taskMenuTargets.has(id),true,"Every Notes task section must have a Browse by Task shortcut: "+id);
function assertDirectoryCountContract(prefix,label){
  const ids=[...notesIndex.matchAll(new RegExp('id="('+prefix+'-[^"]+)"','g'))].map(match=>match[1]);
  for(const id of ids){
    const sectionStart=notesIndex.indexOf('id="'+id+'"');
    const sectionEnd=notesIndex.indexOf("</section>",sectionStart);
    assert.ok(sectionStart>=0&&sectionEnd>sectionStart,label+" section markup missing: "+id);
    const section=notesIndex.slice(sectionStart,sectionEnd);
    const sectionCount=section.match(/<span class="badge">([0-9]+) notes?<\/span>/);
    assert.ok(sectionCount,label+" section count missing: "+id);
    const actualCount=(section.match(/<li>/g)||[]).length;
    assert.equal(Number(sectionCount[1]),actualCount,label+" section count must match its listed notes: "+id);
    const menuLink=notesIndex.indexOf('href="#'+id+'"');
    assert.ok(menuLink>=0,label+" menu shortcut missing: "+id);
    const cardStart=notesIndex.lastIndexOf('<article class="card">',menuLink);
    const cardEnd=notesIndex.indexOf("</article>",menuLink);
    assert.ok(cardStart>=0&&cardEnd>menuLink,label+" menu card missing: "+id);
    const menuCard=notesIndex.slice(cardStart,cardEnd);
    const menuCount=menuCard.match(/<p class="eyebrow">([0-9]+) notes?<\/p>/);
    assert.ok(menuCount,label+" menu card count missing: "+id);
    assert.equal(Number(menuCount[1]),actualCount,label+" menu count must match the linked section: "+id);
  }
}
assertDirectoryCountContract("subject","Subject");
assertDirectoryCountContract("task","Task");


const safeBrowserTools=fs.readFileSync("notes/building-safe-browser-based-it-tools/index.html","utf8");
assert.equal(citationPlaceholderPattern.test(safeBrowserTools),false,"Published browser-tools note must not expose internal citation placeholders");
for(const phrase of [
  "browser File API</a>",
  "MDN’s Web Storage API reference</a>",
  "OWASP HTML5 Security Cheat Sheet</a>",
  "MDN’s Clipboard API documentation</a>",
  "Published: 2026-09-29 · Updated: 2026-10-12",
  '"dateModified":"2026-10-12"'
])assert.equal(safeBrowserTools.includes(phrase),true,"Browser-tools source and freshness contract missing: "+phrase);

const escalationHandoffGuide=fs.readFileSync("notes/it-support-escalation-handoff-checklist/index.html","utf8");
for(const phrase of [
  "Worked example: an app fails on one managed device",
  "Illustrative example only; this is not a real user or employer incident.",
  "One user cannot complete an approved work task",
  "The same user can complete the task on another approved managed device",
  "the comparison narrows the scope but does not prove a root cause",
  "Ask the receiving team to confirm the supported app/device state",
  "Do not ask for a security bypass",
  "Published: 2026-09-27 · Updated: 2026-10-13",
  '"dateModified":"2026-10-13"'
])assert.equal(escalationHandoffGuide.includes(phrase),true,"Escalation handoff example/freshness contract missing: "+phrase);

const aiToolSelectionGuide=fs.readFileSync("notes/choosing-ai-tools-privacy-cost-fit/index.html","utf8");
for(const phrase of [
  "Worked example: choose a tool for a low-risk summary",
  "The tools and test results below are fictional",
  "Candidate B is the better fit because its output is easier to verify",
  "not because it is universally more capable or safer",
  "neither candidate should be used until the organization's policy",
  "Record the task, sample, observed errors, review effort",
  "Published: 2026-09-29 · Updated: 2026-10-13 · 7 min read",
  '"dateModified":"2026-10-13"'
])assert.equal(aiToolSelectionGuide.includes(phrase),true,"AI tool-selection example/freshness contract missing: "+phrase);

const apiSupportGuide=fs.readFileSync("notes/apis-explained-for-it-support/index.html","utf8");
for(const phrase of [
  "Worked example: an inventory lookup returns an error",
  "This is a fictional request and not a real company endpoint or incident.",
  "401 Unauthorized",
  "403 Forbidden",
  "429 Too Many Requests",
  "These are starting questions, not guaranteed diagnoses.",
  "never publish access tokens, cookies, private payloads or personal data",
  "Published: 2026-09-27 · Updated: 2026-10-13",
  '"dateModified":"2026-10-13"'
])assert.equal(apiSupportGuide.includes(phrase),true,"API troubleshooting example/freshness contract missing: "+phrase);






const healthInsuranceBasics=fs.readFileSync("notes/health-insurance-understanding-the-basics/index.html","utf8");
for(const phrase of [
  "https://irdai.gov.in/health-dept",
  "https://irdai.gov.in/circulars?filterDepartment=HLT&amp;filtersApplied=true",
  "https://bimabharosa.irdai.gov.in/Home/FAQ",
  "Sources checked: 2026-10-13",
  "maximum 36-month waiting period",
  "Grievance Redressal Officer",
  "retain its token number",
  '"dateModified":"2026-10-13"',
  "Financial Content Disclosure"
])assert.equal(healthInsuranceBasics.includes(phrase),true,"Health insurance primary-source/escalation contract missing: "+phrase);
assert.equal(healthInsuranceBasics.includes("Sources checked: 2026-10-12"),false,"Health insurance source date must reflect the current review");
assert.equal(healthInsuranceBasics.includes("turn0search"),false,"Health insurance note must not expose internal citation placeholders");

const incomeTaxStartingPoint=fs.readFileSync("notes/indian-income-tax-practical-starting-point/index.html","utf8");
for(const phrase of [
  "Sources checked: 2026-10-13",
  "https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/objective-and-scope-new-act-faq",
  "https://www.incometaxindia.gov.in/w/tax-rates-and-computation",
  "https://www.incometax.gov.in/iec/foportal/node/11724",
  "Tax Year 2026-27",
  "income earned from 1 April 2026 onward",
  '"dateModified":"2026-10-13"',
  "Financial Content Disclosure"
])assert.equal(incomeTaxStartingPoint.includes(phrase),true,"Income-tax transition/source contract missing: "+phrase);
assert.equal(incomeTaxStartingPoint.includes("Sources checked: 2026-10-12"),false,"Income-tax source review date must match the checked sources");
const refreshedTaxRegimeComparison=fs.readFileSync("notes/new-vs-old-tax-regime-comparison/index.html","utf8");
for(const phrase of [
  "Sources checked: 2026-10-13",
  "https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/objective-and-scope-new-act-faq",
  "https://www.incometaxindia.gov.in/w/tax-rates-and-computation",
  "https://www.incometaxindia.gov.in/Documents/Budget2026/FAQs-Budget-2026.pdf",
  "rather than carrying this page's old-Act section references forward",
  '"dateModified":"2026-10-13"',
  "Financial Content Disclosure"
])assert.equal(refreshedTaxRegimeComparison.includes(phrase),true,"Tax regime period/source contract missing: "+phrase);
assert.equal(refreshedTaxRegimeComparison.includes("Sources checked: 2026-10-12"),false,"Tax comparison source date must reflect the current source review");

const workHubPage=fs.readFileSync("work/index.html","utf8");
for(const phrase of [
  "<h3>Networking</h3><p>A layer-by-layer method for narrowing connectivity symptoms",
  'href="/notes/networking-layer-by-layer-diagnostic-framework/"',
  "<h3>Automation</h3><p>Start with one repetitive task, define its inputs and outputs",
  'href="/notes/small-it-automation-starting-point/"',
  "Read the diagnostic framework",
  "Read the automation guide"
])assert.equal(workHubPage.includes(phrase),true,"Work hub destination-specific pathway contract missing: "+phrase);
assert.equal(workHubPage.includes("<h3>Networking &amp; Automation</h3>"),false,"Networking and automation must link to distinct task guides");

const topicHubPage=fs.readFileSync("topics/index.html","utf8");
for(const phrase of [
  "Budgeting, Emergency Funds &amp; Net Worth",
  "organize example figures without giving personalized financial advice",
  'href="/notes/money-basics-budget-emergency-net-worth/"',
  'href="/tools/personal-finance-snapshot/"',
  "Prompt Building for Everyday Work",
  "This pathway currently points to the AI Prompt Builder; it is not a general catalogue of productivity utilities.",
  'href="/tools/ai-prompt-builder/"'
])assert.equal(topicHubPage.includes(phrase),true,"Topic discovery specificity contract missing: "+phrase);
assert.equal(topicHubPage.includes("<h3>Money Basics</h3>"),false,"Topic hub must not leave the vague Money Basics label");
assert.equal(topicHubPage.includes("<h3>Productivity Tools</h3>"),false,"Topic hub must not imply a broader productivity-tools catalogue than exists");
assert.equal(topicHubPage.includes("<h3>AI Tools &amp; Prompts</h3>"),false,"Topic hub must not keep the duplicate AI tools/prompts card that repeats the prompt guide and builder destinations");
for(const phrase of [
  "<h3>AI for Work</h3>",
  '<h3>AI for IT Support</h3>',
  "<h3>Choosing AI Tools</h3>",
  "<h3>Prompt Building for Everyday Work</h3>",
  '<a href="/tools/ai-prompt-builder/">Open the AI Prompt Builder →</a>'
])assert.equal(topicHubPage.includes(phrase),true,"Distinct AI discovery pathway missing: "+phrase);

const projectsEvidencePage=fs.readFileSync("work/projects/index.html","utf8");
for(const phrase of [
  "not named employer incidents or independently measured case outcomes",
  "generalized examples of how I approach troubleshooting",
  "Expected benefit:",
  "not a measured result from a specific case",
  "not a quantified result from a specific case",
  'href="/notes/it-service-desk-troubleshooting-workflow/"',
  'href="/notes/device-provisioning-handoff-checklist/"',
  'href="/notes/service-desk-ticket-documentation/"'
])assert.equal(projectsEvidencePage.includes(phrase),true,"Projects evidence-scope contract missing: "+phrase);
assert.equal(projectsEvidencePage.includes("<strong>Outcome:</strong>"),false,"Generalized work examples must not present expected benefits as case outcomes");

const resourcesReferenceChecklist=fs.readFileSync("resources/index.html","utf8");
for(const phrase of [
  "Using Official References Well",
  "check applicability before following a procedure",
  "A Practical Reference-First Workflow",
  "Define the task",
  "Start with the primary source",
  "Separate guidance from diagnosis",
  "Apply changes within scope",
  "Verify and record",
  "without the required approval"
])assert.equal(resourcesReferenceChecklist.includes(phrase),true,"Resource reference workflow contract missing: "+phrase);

const skillsEvidenceMappingPage=fs.readFileSync("work/skills/index.html","utf8");
for(const phrase of [
  "From skill label to observable support work",
  "Skill area",
  "Observable support practice",
  "Record the user goal, impact, scope, exact symptom and last known-good point",
  "Confirm device ownership, enrollment context and expected management state",
  "Separate sign-in failure from permission, application and service availability",
  "avoid treating one successful ping as proof that the full workflow works",
  "test on sample input, inspect output and define failure handling",
  "/notes/it-service-desk-troubleshooting-workflow/",
  "/notes/apple-device-management-enrollment-models/",
  "/notes/microsoft-sign-in-troubleshooting-guide/",
  "/notes/network-connectivity-first-response-checklist/",
  "/notes/service-desk-ticket-documentation/",
  "/notes/small-it-automation-starting-point/",
  "not records of a particular employer incident",
  "do not imply administrator access to every platform"
])assert.equal(skillsEvidenceMappingPage.includes(phrase),true,"Skills evidence-mapping contract missing: "+phrase);

const retirementStartGuide=fs.readFileSync("notes/retirement-planning-start-with-the-number/index.html","utf8");
for(const phrase of [
  "PFRDA: NPS All Citizen Model",
  "last-amended-on-20th-july-2026",
  "Sources checked: 2026-10-13 · Country context: India.",
  "Published: 2026-09-28 · Updated: 2026-10-13 · 7 min read",
  '"datePublished":"2026-09-28","dateModified":"2026-10-13"'
])assert.equal(retirementStartGuide.includes(phrase),true,"Retirement source/freshness contract missing: "+phrase);

const rebuildCaseStudy=fs.readFileSync("blog/rebuilding-jawed-co-in/index.html","utf8");
for(const phrase of [
  "Rebuilding Jawed.co.in",
  "Published: 2026-09-27 · Updated: 2026-10-12",
  '"datePublished":"2026-09-27","dateModified":"2026-10-12"'
])assert.equal(rebuildCaseStudy.includes(phrase),true,"Website-rebuild article date/metadata contract missing: "+phrase);
assert.equal(rebuildCaseStudy.includes("<p class=\"meta\">September 2026</p>"),false,"Website-rebuild article must display its publication and update dates, not only the publication month");

const credentialsPage=fs.readFileSync("work/certifications/index.html","utf8");
for(const phrase of [
  "<h2>Completed Certifications &amp; Qualifications</h2>",
  "<h3>Microsoft Azure Fundamentals — AZ-900</h3><span class=\"badge\">Completed</span>",
  "<h3>Advanced Diploma in Hardware &amp; Networking</h3><span class=\"badge\">Completed</span>",
  "<h2>Historical Qualifications</h2>",
  "<h3>MCSE — Windows Server 2003</h3><span class=\"badge\">Historical</span>",
  "<h3>Apple Certified Support Professional 10.9</h3><span class=\"badge\">Historical</span>",
  "<h3>Apple Certified Support Professional 10.11</h3><span class=\"badge\">Historical</span>",
  "not as a claim of current Apple certification status"
])assert.equal(credentialsPage.includes(phrase),true,"Credential status clarity contract missing: "+phrase);
assert.equal(credentialsPage.includes("<h3>Apple Certified Support Professional 10.9</h3><span class=\"badge\">Completed</span>"),false,"Legacy Apple 10.9 credential must not be labeled simply Completed");
assert.equal(credentialsPage.includes("<h3>Apple Certified Support Professional 10.11</h3><span class=\"badge\">Completed</span>"),false,"Legacy Apple 10.11 credential must not be labeled simply Completed");

const microsoftSigninGuide=fs.readFileSync("notes/microsoft-sign-in-troubleshooting-guide/index.html","utf8");
for(const phrase of [
  "Worked example: separate application from account scope",
  "this is not a record of a real user or employer incident",
  "The desktop application path is worth checking first",
  "Use authorized identity troubleshooting and sign-in evidence",
  "Check the organization’s approved Microsoft 365 service-health source",
  "These comparisons help prioritize investigation; they do not prove a root cause.",
  "Sanitized handoff pattern:",
  "Keep credentials, authentication codes, session tokens and unnecessary personal or tenant data out of public examples.",
  "Published: 2026-09-29 · Updated: 2026-10-13",
  '"dateModified":"2026-10-13"'
])assert.equal(microsoftSigninGuide.includes(phrase),true,"Microsoft sign-in example/safety/freshness contract missing: "+phrase);
assert.equal(microsoftSigninGuide.includes("Updated: 2026-10-13 · Updated:"),false,"Microsoft guide must show one clear update date");

const appleEnrollmentGuide=fs.readFileSync("notes/apple-device-management-enrollment-models/index.html","utf8");
for(const phrase of [
  "Worked example: use ownership and deployment stage to narrow the model",
  "Illustrative triage aid, not a substitute",
  "Account-driven User Enrollment",
  "Device Enrollment itself includes account-driven and profile-based approaches",
  "Account-driven Device Enrollment can support organization-owned devices already in use without erasing them",
  "Automated Device Enrollment",
  "Apple Business: Enrollment methods for built-in device management",
  "These are starting points, not automatic answers.",
  "stop before erasing the device, removing management or bypassing a restriction",
  '"@type":"BreadcrumbList"' ,
  '"position":3,"name":"Apple Device Management: Understanding Enrollment Models"' ,
  "Published: 2026-09-29 · Updated: 2026-10-13",
  '"dateModified":"2026-10-13"'
])assert.equal(appleEnrollmentGuide.includes(phrase),true,"Apple enrollment example/freshness contract missing: "+phrase);

const interviewPlanner=fs.readFileSync("tools/interview-preparation-planner/index.html","utf8");
for(const phrase of [
  "Worked example",
  "Illustrative job-description excerpt:",
  "Possible preparation topics:",
  "What this tool can and cannot tell you",
  "keyword overlap only; it is not an ATS score",
  "A missing keyword does not prove you lack a skill",
  "The planner runs in your browser",
  "does not predict an employer's interview process"
])assert.equal(interviewPlanner.includes(phrase),true,"Interview planner reader-value/privacy/limitations contract missing: "+phrase);

const kbDraft=fs.readFileSync("tools/ticket-to-knowledge-base-draft/index.html","utf8");
for(const phrase of [
  "Worked example (fictional)",
  "not a record of a real user, employer or incident",
  "Separate observed facts from possible causes",
  "Record only an approved action that was actually tested",
  "If no action is confirmed, write that the cause or resolution remains unconfirmed",
  "Review the article when the application version, sign-in process or support policy changes"
])assert.equal(kbDraft.includes(phrase),true,"Knowledge-base draft worked-example/safety contract missing: "+phrase);

const articleImagePages=[
  "notes/service-desk-ticket-documentation/index.html",
  "notes/health-insurance-understanding-the-basics/index.html",
  "notes/apple-device-management-enrollment-models/index.html",
  "notes/it-support-escalation-handoff-checklist/index.html",
  "notes/apis-explained-for-it-support/index.html",
  "notes/choosing-ai-tools-privacy-cost-fit/index.html",
  "notes/retirement-planning-start-with-the-number/index.html",
  "notes/inflation-and-future-goal-planning/index.html",
  "notes/indian-income-tax-practical-starting-point/index.html",
  "notes/new-vs-old-tax-regime-comparison/index.html",
  "notes/device-provisioning-handoff-checklist/index.html",
  "notes/scoping-it-issues-user-device-service/index.html",
  "notes/small-it-automation-starting-point/index.html",
  "notes/windows-first-response-troubleshooting-checklist/index.html",
  "notes/network-connectivity-first-response-checklist/index.html",
  "notes/ai-for-it-support-practical-workflow/index.html",
  "notes/us-stocks-etfs-starting-point/index.html",
  "notes/indian-mutual-funds-index-etfs-starting-point/index.html",
  "notes/portfolio-allocation-rebalancing-framework/index.html",
  "notes/money-basics-budget-emergency-net-worth/index.html",
  "notes/retirement-corpus-calculation-framework/index.html",
  "notes/retirement-withdrawals-sequence-risk-income-review/index.html",
  "blog/rebuilding-jawed-co-in/index.html"
];
const articleImageExpectedTypes={"blog/rebuilding-jawed-co-in/index.html":"BlogPosting"};
for(const pagePath of articleImagePages){
  const articleHtml=fs.readFileSync(pagePath,"utf8");
  const articleJsonLd=articleHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.notEqual(articleJsonLd,null,"Reviewed article JSON-LD missing: "+pagePath);
  const articleSchema=JSON.parse(articleJsonLd[1]);
  assert.equal(articleSchema["@type"],articleImageExpectedTypes[pagePath]||"Article","Reviewed article schema type mismatch: "+pagePath);
  assert.equal(articleSchema.image,"https://jawed.co.in/assets/images/social-preview.png","Article schema image must match the existing social preview: "+pagePath);
  assert.equal(articleHtml.includes('<meta property="og:image" content="https://jawed.co.in/assets/images/social-preview.png">'),true,"Article image must match existing social metadata: "+pagePath);
}

const noteFormatter=fs.readFileSync("tools/service-desk-note-formatter/index.html","utf8");
for(const phrase of [
  "Worked example (fictional)",
  "not a record of a real user, employer or incident",
  "Formatted output",
  "Unresolved. The cause is not confirmed",
  "without inventing a root cause or claiming the issue was fixed"
])assert.equal(noteFormatter.includes(phrase),true,"Service Desk note formatter example/evidence-boundary contract missing: "+phrase);

assert.equal(noteFormatter.includes("Broader impact has not been established.\\n\\nActions Taken:"),false,"Worked example must use real HTML line breaks, not visible backslash-n sequences");
const troubleshootingAssistant=fs.readFileSync("tools/it-troubleshooting-assistant/index.html","utf8");
for(const phrase of [
  "Worked example (fictional)",
  "Choose <strong>Network / connectivity</strong>",
  "Can the device reach any known website or network resource?",
  "basic connectivity is not working",
  "does not prove a network root cause"
])assert.equal(troubleshootingAssistant.includes(phrase),true,"IT troubleshooting assistant worked-example/evidence-boundary contract missing: "+phrase);
assert.equal(troubleshootingAssistant.includes('</p></section></section><section class="content-section"><h2>How this assistant works</h2>'),false,"IT troubleshooting assistant must not retain the duplicate section close");

const safeBrowserToolsGuide=fs.readFileSync("notes/building-safe-browser-based-it-tools/index.html","utf8");
for(const phrase of [
  "Worked example: a local ticket-note formatter",
  "Use a text-safe output path such as <code>textContent</code>",
  "pasted markup",
  "Inspect network requests",
  "local processing of the note does not mean the whole page makes no network requests"
])assert.equal(safeBrowserToolsGuide.includes(phrase),true,"Safe browser tools worked-example/privacy contract missing: "+phrase);

const contactPage=fs.readFileSync("contact/index.html","utf8");
for(const phrase of [
  "Before you send",
  "passwords, one-time codes, recovery tokens",
  "not an urgent IT support channel",
  "does not transmit or store the message text",
  "no response time or service-level agreement is promised"
])assert.equal(contactPage.includes(phrase),true,"Contact page privacy/scope contract missing: "+phrase);

const seoMetadataContracts=[
  {path:"notes/small-it-automation-starting-point/index.html",title:"IT Automation: Start With Repetitive Work | Jawed Imtiaz"},
  {path:"notes/network-connectivity-first-response-checklist/index.html",title:"Network Connectivity First-Response Checklist | Jawed Imtiaz"},
  {path:"notes/microsoft-sign-in-troubleshooting-guide/index.html",title:"Microsoft Sign-In Troubleshooting Guide | Jawed Imtiaz"},
  {path:"notes/it-troubleshooting-guide-knowledge-base/index.html",title:"IT Troubleshooting Guides from Incidents | Jawed Imtiaz"},
  {path:"notes/indian-mutual-funds-index-etfs-starting-point/index.html",title:"Indian Mutual Funds, Index Funds and ETFs | Jawed Imtiaz"},
  {path:"notes/retirement-withdrawals-sequence-risk-income-review/index.html",title:"Retirement Withdrawals: Sequence Risk and Income | Jawed Imtiaz"},
  {path:"notes/interactive-tools-ai-assisted-experiences-architecture/index.html",title:"Interactive Tools and AI Architecture | Jawed Imtiaz"},
  {path:"notes/networking-layer-by-layer-diagnostic-framework/index.html",title:"Layer-by-Layer Network Troubleshooting | Jawed Imtiaz"},
  {path:"notes/scoping-it-issues-user-device-service/index.html",title:"Scoping IT Issues: User, Device or Service? | Jawed Imtiaz"},
  {path:"notes/apis-explained-for-it-support/index.html",title:"APIs for IT Support: A Practical Guide | Jawed Imtiaz"},
  {path:"notes/apple-device-management-enrollment-models/index.html",title:"Apple Device Management: Enrollment Models | Jawed Imtiaz"},
  {path:"notes/portfolio-allocation-rebalancing-framework/index.html",title:"Portfolio Allocation and Rebalancing | Jawed Imtiaz"},
  {path:"notes/money-basics-budget-emergency-net-worth/index.html",title:"Money Basics: Budget, Emergency Fund, Net Worth | Jawed Imtiaz"},
  {path:"notes/new-vs-old-tax-regime-comparison/index.html",title:"New vs Old Tax Regime: Key Differences | Jawed Imtiaz"},
  {path:"notes/building-safe-browser-based-it-tools/index.html",title:"Safe Browser-Based IT Tools: Design Guide | Jawed Imtiaz",description:"A practical guide to safe browser-based IT tools: validate inputs, protect privacy, handle permissions and make failures visible."},
  {path:"notes/interactive-tools-ai-assisted-experiences-architecture/index.html",description:"A practical architecture for browser tools and AI experiences, with clear boundaries for local logic, external services, storage and user review."},
  {path:"work/projects/index.html",title:"IT Projects and Practical Tools | Jawed Imtiaz",description:"A portfolio of practical technology projects and browser-based tools, with public-safe examples and clear boundaries around measured outcomes."},
  {path:"work/experience/index.html",title:"IT Support Experience and Highlights | Jawed Imtiaz"},
  {path:"work/skills/index.html",title:"IT Support Skills and Tools | Jawed Imtiaz"},
  {path:"privacy/index.html",title:"Website Privacy and Data Handling | Jawed Imtiaz",description:"How jawed.co.in handles contact messages, browser-based tools, local storage, analytics, third-party services and privacy choices."},
  {path:"topics/index.html",title:"Practical Technology, AI and Finance Topics | Jawed Imtiaz"}
];
for(const contract of seoMetadataContracts){
  const html=fs.readFileSync(contract.path,"utf8");
  if(contract.title){
    const title=(html.match(/<title>([^<]*)<\/title>/i)||[])[1]?.trim()||"";
    assert.equal(title,contract.title,"SEO title contract mismatch: "+contract.path);
    assert.ok(title.length<=65,"SEO title should avoid unnecessary truncation: "+contract.path);
  }
  if(contract.description){
    const description=(html.match(/<meta name="description" content="([^"]*)"/i)||[])[1]?.trim()||"";
    assert.equal(description,contract.description,"Meta description contract mismatch: "+contract.path);
    assert.ok(description.length<=160,"Meta description should fit a practical snippet length: "+contract.path);
  }
}

const financeWorkspace=fs.readFileSync("tools/finance-planning-workspace/index.html","utf8");
for(const phrase of [
  "Financial Content Disclosure",
  "does not provide personalized investment, financial, tax or trading advice",
  "does not recommend or endorse any stock, ETF, mutual fund",
  "not a SEBI-registered Investment Adviser or Research Analyst",
  "possible loss of capital"
])assert.equal(financeWorkspace.includes(phrase),true,"Finance Planning Workspace disclosure contract missing: "+phrase);

const taxRebateGuides=[
  {path:"notes/indian-income-tax-practical-starting-point/index.html",html:fs.readFileSync("notes/indian-income-tax-practical-starting-point/index.html","utf8")},
  {path:"notes/new-vs-old-tax-regime-comparison/index.html",html:fs.readFileSync("notes/new-vs-old-tax-regime-comparison/index.html","utf8")}
];
for(const guide of taxRebateGuides){
  assert.equal(guide.html.includes("Marginal relief may apply just above the threshold under the statutory calculation"),true,"Tax rebate marginal-relief qualification missing: "+guide.path);
  assert.equal(guide.html.includes("rebate cannot be applied against tax on special-rate income"),true,"Tax rebate special-rate limitation missing: "+guide.path);
}

const taxRegimeComparisonStandardDeduction=fs.readFileSync("notes/new-vs-old-tax-regime-comparison/index.html","utf8");
for(const phrase of [
  "up to ₹50,000 under the old regime and up to ₹75,000 under the new regime for AY 2026-27",
  "limited to the amount of qualifying salary or pension"
])assert.equal(taxRegimeComparisonStandardDeduction.includes(phrase),true,"Standard-deduction comparison guidance missing: "+phrase);

const usStocksNote=fs.readFileSync("notes/us-stocks-etfs-starting-point/index.html","utf8");
for(const phrase of [
  "If you invest from India",
  "Reserve Bank of India’s current Liberalised Remittance Scheme (LRS) directions",
  "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=10192",
  "foreign-asset or foreign-income reporting may also matter",
  "https://www.incometax.gov.in/iec/foportal/nudge/nudge-schedule-fa"
])assert.equal(usStocksNote.includes(phrase),true,"India-resident overseas investing context missing: "+phrase);

const inflationNote=fs.readFileSync("notes/inflation-and-future-goal-planning/index.html","utf8");
const retirementCorpusNote=fs.readFileSync("notes/retirement-corpus-calculation-framework/index.html","utf8");
const allocationNote=fs.readFileSync("notes/portfolio-allocation-rebalancing-framework/index.html","utf8");
const usEtfNote=fs.readFileSync("notes/us-stocks-etfs-starting-point/index.html","utf8");
const futureGoalLakhs=10*Math.pow(1.06,10);
assert.equal(futureGoalLakhs.toFixed(2),"17.91","Inflation example arithmetic changed; review before editing the displayed result");
assert.equal(inflationNote.includes("₹17.91 lakh"),true,"Inflation example result does not match its stated inputs");
const retirementCorpusLakhs=15*(1-Math.pow(1.03,-30))/0.03;
assert.equal((retirementCorpusLakhs/100).toFixed(2),"2.94","Retirement corpus example arithmetic changed; review before editing the displayed result");
assert.equal(retirementCorpusNote.includes("₹2.94 crore"),true,"Retirement corpus example result does not match its stated inputs");
const allocationTotal=6.8+2.2+1.0;
assert.equal(allocationTotal,10,"Portfolio allocation example total changed");
assert.equal((6.8/allocationTotal*100).toFixed(0),"68","Equity allocation example weight changed");
assert.equal((2.2/allocationTotal*100).toFixed(0),"22","Bond allocation example weight changed");
for(const phrase of ["68%","22%","10%"])assert.equal(allocationNote.includes(phrase),true,"Portfolio allocation example table is missing a calculated weight: "+phrase);
const overlapExposure=5*0.5+5*0.4;
assert.equal(overlapExposure,4.5,"ETF overlap example exposure changed");
assert.equal((overlapExposure/10*100).toFixed(0),"45","ETF overlap example percentage changed");
for(const phrase of ["₹4.5 lakh","45%"])assert.equal(usEtfNote.includes(phrase),true,"ETF overlap example does not match its stated inputs: "+phrase);

const indianMutualFundsNote=fs.readFileSync("notes/indian-mutual-funds-index-etfs-starting-point/index.html","utf8");
for(const phrase of [
  "Check the scheme documents and Riskometer",
  "Scheme Information Document (SID), Key Information Memorandum (KIM) and factsheet",
  "https://investor.sebi.gov.in/riskometer.html",
  "not a guarantee of outcomes"
])assert.equal(indianMutualFundsNote.includes(phrase),true,"Indian mutual-fund due-diligence guidance missing: "+phrase);

const retirementSequenceNote=fs.readFileSync("notes/retirement-withdrawals-sequence-risk-income-review/index.html","utf8");
const gainThenLossYear1=100*1.20-10;
const gainThenLossYear2=gainThenLossYear1*0.80-10;
const lossThenGainYear1=100*0.80-10;
const lossThenGainYear2=lossThenGainYear1*1.20-10;
assert.deepEqual([gainThenLossYear1,gainThenLossYear2,lossThenGainYear1,lossThenGainYear2],[110,78,70,74],"Retirement sequence-risk example arithmetic changed; review inputs and displayed results together");
for(const phrase of ["₹110L","₹78L","₹70L","₹74L","₹6 lakh a year (₹9 lakh − ₹3 lakh)"])assert.equal(retirementSequenceNote.includes(phrase),true,"Retirement sequence-risk or funding-gap example is missing a calculated result: "+phrase);

const moneyBasicsNote=fs.readFileSync("notes/money-basics-budget-emergency-net-worth/index.html","utf8");
const monthlyCashFlow=35000+10000+15000;
assert.equal(monthlyCashFlow,60000,"Monthly cash-flow example categories no longer reconcile to take-home income");
assert.equal(60000-monthlyCashFlow,0,"Monthly cash-flow example has an unexplained remainder");
assert.equal(35000*3,105000,"Three-month emergency reserve example arithmetic changed");
assert.equal(35000*6,210000,"Six-month emergency reserve example arithmetic changed");
assert.equal(800000-300000,500000,"Net-worth example arithmetic changed");
for(const phrase of ["₹60,000","₹35,000","₹10,000","₹15,000","₹1,05,000","₹2,10,000","₹5,00,000"])assert.equal(moneyBasicsNote.includes(phrase),true,"Budget, reserve or net-worth example does not match its inputs: "+phrase);

const retirementCorpusReference=fs.readFileSync("notes/retirement-corpus-calculation-framework/index.html","utf8");
assert.equal(retirementCorpusReference.includes("https://pfrda.org.in/en/regulatory-framework/regulations"),true,"Retirement corpus note must retain the stable official PFRDA regulations index");
assert.equal(retirementCorpusReference.includes("including the Exits and Withdrawals Regulations updated 20 July 2026"),true,"Retirement corpus PFRDA reference label must identify the relevant regulation and date");

console.log("AdSense content readiness validation: PASS");
console.log("Content inventory routes checked:",inventory.eligible_initial.length+inventory.excluded_initial.length);
console.log("Google approval claimed: no");
