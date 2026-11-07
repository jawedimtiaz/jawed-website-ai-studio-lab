import {findRelevantKnowledge,knowledgeCount} from "../lib/ai-knowledge.js";
import knowledge from "../lib/ai-knowledge-data.js";
import {checkRateLimit,getClientKey,MAX_REQUESTS,WINDOW_MS} from "../lib/ai-rate-limit.js";
import {DEFAULT_MODEL,generateGroundedReply} from "../lib/cloudflare-ai-provider.js";
import {isSafeSourceMetadata,ensureAllowedSourceLink} from "../lib/ai-provider-common.js";
import {buildRetrievalQuery} from "../lib/ai-retrieval.js";
import {aiConfigurationStatus} from "../lib/ai-config.js";

const MAX_BODY_BYTES=12000;
const MAX_MESSAGES=12;
const MAX_MESSAGE_CHARS=2000;
const json=(body,status=200,extraHeaders={})=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...extraHeaders}});
const requestId=()=>crypto.randomUUID();
const failure=(error,code,status,id,extra={})=>{
  console.error(JSON.stringify({event:"ai_request_failure",request_id:id,code,status,...extra}));
  return json({error,code,request_id:id},status,{"x-request-id":id});
};

export function isAllowedOrigin(origin){
  if(!origin)return true;
  try{
    const url=new URL(origin);
    if(url.origin!==origin)return false;
    const host=url.hostname.toLowerCase();
    const localHost=host==="localhost"||host==="127.0.0.1";
    if(localHost)return url.protocol==="http:"||url.protocol==="https:";
    if(url.protocol!=="https:")return false;
    if(host==="jawed.co.in"||host.endsWith(".jawed.co.in"))return true;
    if(host==="jawed-website-ai-studio-lab.pages.dev"||host.endsWith(".jawed-website-ai-studio-lab.pages.dev"))return true;
    if(host==="jawed-website-ai-studio-lab.jawed-eee.workers.dev")return true;
    if(host==="jawed-studio-hq-preview.jawed-eee.workers.dev")return true;
  }catch{
    return false;
  }
  return false;
}

function allowedOrigin(request){
  const origin=request.headers.get("origin");
  return isAllowedOrigin(origin);
}

function corsHeaders(request){
  const origin=request?.headers?.get("origin");
  if(origin&&isAllowedOrigin(origin)){
    return {"access-control-allow-origin":origin};
  }
  return {};
}

function validConversation(messages){
  return messages.every((message,index)=>message.role===(index%2===0?"user":"assistant"))&&messages[0]?.role==="user";
}

function publicSources(sources){
  return sources.filter(isSafeSourceMetadata).map(source=>({url:source.url,title:source.title,summary:source.summary,keywords:source.keywords.slice(0,40)}));
}

function publicSourceReferences(sources){
  return sources.map(({url,title})=>({url,title}));
}
function knowledgeEntry(url){
  const source=knowledge.entries.find(entry=>entry.url===url);
  return source?{url:source.url,title:source.title,summary:source.summary,keywords:source.keywords}:null;
}

const PERSONAL_BOUNDARY_REPLY="I can help with Jawed.co.in's public professional information, notes, tools and resources, but I don't provide personal-life details such as marital status, family details, private location, salary, age, or net worth.";

function deterministicIntentReply(question,messages=[]){
  const value=question.trim().toLowerCase().replace(/[?!.]+$/g,"").trim();
  const closing=["bye","goodbye","good night","see you","see ya","talk to you later","thanks","thank you","thx","ok bye","okay bye"];
  if(closing.includes(value))return {reply:"Goodbye! 👋",sources:[]};

  const personalPatterns=[
    /\b(?:is|was|are)\s+jawed(?:\s+imtiaz)?\s+(?:married|single|bachelor|divorced|widowed)\b/,
    /\b(?:marital|marriage)\s+status\b/,
    /\b(?:married|single|bachelor|divorced|widowed)\b(?:\s+(?:or|vs\.?|versus)\s+(?:married|single|bachelor|divorced|widowed))?\b/,
    /\b(?:wife|husband|spouse|children|child|son|daughter|family|kids?|friend|friends|brother|sister|sibling|father|mother|parent|parents|cousin|uncle|aunt|relative|relatives|relationship|relationships|girlfriend|boyfriend|partner|partners)\b/,
    /\b(?:where|which city|what city)\b.*\b(?:live|lives|stay|stays|reside|resides|home|house|location|address)\b|\b(?:home address|private address|personal address|phone number|mobile number|personal phone|private phone|personal email|private email)\b|\b(?:what is|what's|give me|tell me)\s+(?:(?:his|her)|(?:jawed(?:\s+imtiaz)?)'s)\s+(?:address|phone|mobile|email)\b|\b(?:where|which city|what city)\b.*\b(?:born|birthplace|hometown|native place)\b|\b(?:birthplace|hometown|native place)\b/,
    /\b(?:salary|pay|income|earnings|ctc|compensation|net\s*worth|wealth|assets)\b/,
    /\b(?:religion|religious|political affiliation|political party|party membership|sexual orientation|sexuality|health condition|medical condition|medical history|diagnosis|disability)\b/,
    /\b(?:nationality|citizenship|citizen of|passport|passport number|government id|government identification|aadhaar|pan number|tax id|identity card|id number)\b/,
    /\b(?:personal social media|private social media|personal instagram|private instagram|personal facebook|private facebook|personal twitter|private twitter|social media handle|instagram account|facebook account|twitter account)\b/,
    /\b(?:how old|age|date of birth|dob|birthday)\b/,
    /\b(?:bank account|bank account number|account number|upi id|upi handle|credit card|credit card number|debit card|debit card number|brokerage account|demat account|trading account)\b/,
    /\b(?:personal travel history|private travel history|personal trip history|private trip history|past trips?|previous trips?|past flights?|previous flights?|travel itinerary history|flight history|flight booking history|flight reservation history|hotel booking history|hotel reservation history|travel booking history|travel reservation history|private travel records?|personal travel records?)\b|\b(?:what|which)\s+(?:trips?|flights?|travel)\s+(?:has|did)\s+(?:he|jawed(?:\s+imtiaz)?)\s+(?:taken|take|book|booked|travelled|traveled)\s+(?:privately|personally)\b/,
    /\b(?:personal travel plans?|private travel plans?|personal itinerary|private itinerary|flight booking|flight reservation|hotel booking|hotel reservation|travel booking|travel reservation)\b/,
    /\b(?:personal vehicle|private vehicle|personal car|private car|car ownership|vehicle ownership|owns? a car|owns? a vehicle|personal property|private property|property ownership)\b/,
    /\b(?:personal schedule|private schedule|personal calendar|private calendar|personal appointment|private appointment|personal availability|private availability)\b/,
    /\b(?:personal bonus|private bonus|personal benefits?|private benefits?|employee benefits?|personal esop|private esop|personal stock options?|private stock options?|personal equity compensation|private equity compensation|personal investment(?:s)?|private investment(?:s)?|personal mutual funds?|private mutual funds?)\b/,
    /\b(?:personal password|private password|password for his|his password|(?:jawed(?:\s+imtiaz)?)\x27s password|personal credential(?:s)?|private credential(?:s)?|login credential(?:s)?|private api key|personal api key|(?:jawed(?:\s+imtiaz)?)\x27s api key|private secret|personal secret|security question(?:s)?|security answer(?:s)?)\b/,
    /\b(?:personal device|private device|personal laptop|private laptop|personal computer|private computer|personal phone|private phone|device serial number|laptop serial number|computer serial number|phone imei|imei number|device imei|personal device id|private device id)\b/,
    /\b(?:personal subscription|private subscription|personal subscriptions|private subscriptions|streaming subscription|streaming subscriptions|personal membership|private membership|personal service subscription|private service subscription|personal browsing history|private browsing history|browser history|search history|personal purchase history|private purchase history|personal order history|private order history|personal account history|private account history)\b/,
    /\b(?:personal messages?|private messages?|personal text messages?|private text messages?|text message history|message history|chat history|private chats?|personal chats?|call history|private calls?|personal calls?|call logs?|contact list|personal contacts?|private contacts?|personal correspondence|private correspondence|personal letters?|private letters?|private communications?|personal communications?)\b|\bwho\s+does\s+(?:he|jawed(?:\s+imtiaz)?)\s+(?:communicate|talk|chat)\s+with\s+privately\b/,
    /\b(?:personal utility account|private utility account|utility account number|electricity account|electricity bill|water account|water bill|gas account|gas bill|internet account|internet bill|utility customer number|utility consumer number|utility meter number|meter number|personal utility details|private utility details)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)'s|his|personal|private)\s+(?:shipping address|delivery address|billing address|(?:package|parcel|order)\s+delivery address|shipping details|delivery details|order delivery details)\b|\bwhere\s+should\s+(?:his|jawed(?:\s+imtiaz)?)'?(?:s)?\s+(?:package|parcel|order)\s+be delivered\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)'s|his|personal|private)\s+(?:doctor|physician|medical provider|health provider|healthcare provider|clinic|hospital|medical appointment|health appointment|doctor appointment|hospital appointment|clinic appointment|medical visit|health visit|healthcare visit|medical details|health details)\b|\b(?:what|which)\s+(?:doctor|physician|clinic|hospital|health provider|healthcare provider)\s+does\s+(?:he|jawed(?:\s+imtiaz)?)\s+(?:see|visit|use|go to)(?:\s+privately)?\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)'s|his|personal|private)\s+(?:employee id|employee number|personnel number|payroll id|hr id|hr record(?:s)?|personnel record(?:s)?|employee record(?:s)?|performance review|performance appraisal|appraisal record|disciplinary record|leave balance|leave record|hr case|hr complaint|hr details)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)'s|his|personal|private)\s+(?:income tax return|tax return|it return|itr|tax filing(?:s)?|tax assessment|tax notice|tax record(?:s)?|tax statement|tax document(?:s)?)\b/,
    /\b(?:what|which)\s+(?:photos?|photographs?|videos?|media|files?)\s+(?:does|are|is)\s+(?:jawed(?:\s+imtiaz)?|he|his)\b[^?]*\b(?:privately|private|personal)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)'s|his|personal|private)\s+(?:photos?|photographs?|videos?|video files?|media|media files?|gallery|photo gallery|video gallery|personal gallery|private gallery|photo albums?|video albums?|media albums?|personal media|private media)\b/,
    /\b(?:what|which)\s+(?:files|documents)\s+(?:are|is)\s+in\s+(?:(?:jawed(?:\s+imtiaz)?)'s|his|personal|private)\s+(?:private cloud|cloud storage|cloud drive)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)'s|his|personal|private)\s+(?:cloud storage|cloud drive|cloud files|cloud documents|cloud document|cloud folder|cloud folders|personal files|private files|personal documents|private documents|personal drive|private drive|file storage|stored files|stored documents|private cloud files|private cloud documents)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)'s|his|personal|private)\s+(?:loyalty account|loyalty number|rewards account|rewards number|membership account|membership number|member id|reward points|loyalty points|membership points|rewards balance|loyalty balance|membership balance|private rewards details|private loyalty details|private membership details)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)'s|his|personal|private)\s+(?:calendar invitation|calendar invitations|meeting invitation|meeting invitations|private calendar|personal calendar|private calendar details|personal calendar details|private event details|personal event details|private meeting details|personal meeting details|meeting attendees|private meeting attendees|personal meeting attendees|calendar events?|personal calendar events?|private calendar events?|calendar details)\b|\b(?:what|which)\s+(?:private|personal)\s+(?:meetings?|events?)\s+(?:are|is)\s+(?:on|in)\s+(?:(?:his\s+)?(?:calendar|schedule)|(?:jawed(?:\s+imtiaz)?)'s\s+(?:calendar|schedule))\b|\bwho\s+(?:is|are)\s+attending\s+(?:his|(?:jawed(?:\s+imtiaz)?)'s)\s+(?:private\s+)?meetings?\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)'s|his|personal|private)\s+(?:work files?|work documents?|work notes?|internal notes?|internal documents?|internal files?|internal work files?|internal work documents?|internal work notes?|private work details|private work records?|internal work records?|private work tickets?|internal tickets?|support tickets?|private project files?|internal project files?|private project details|internal project details)\b|\b(?:what|which)\s+(?:files?|documents?|notes?|tickets?)\s+(?:are|is)\s+(?:in|from)\s+(?:(?:his\s+)|(?:jawed(?:\s+imtiaz)?)'s\s+)?(?:private|personal|internal)\s+(?:work|project|support)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)'s|his|personal|private)\s+(?:bank transactions?|banking transactions?|account transactions?|transaction history|transaction details|payment transactions?|payment history|bank statement|transaction statement|private transactions?|private banking details|private bank details)\b|\b(?:what|which)\s+(?:transactions?|payments?)\s+(?:are|is)\s+(?:in|on)\s+(?:(?:his\s+)|(?:jawed(?:\s+imtiaz)?)'s\s+)?(?:private|personal)\s+(?:bank account|banking account|account)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)'s|his|personal|private)\s+(?:prescription(?:s)?|medication(?:s)?|medicines?|prescribed medicines?|prescription records?|medication records?|medical prescriptions?|private prescriptions?|private medication details|medication details|prescription details|pharmacy records?|pharmacy details|dosage details?)\b|\b(?:what|which)\s+(?:medications?|medicines?|prescriptions?)\s+(?:does|is)\s+(?:he|jawed(?:\s+imtiaz)?)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)'s|his|personal|private)\s+(?:location history|location details|whereabouts|current whereabouts|location history records?|gps history|gps location|location tracking|travel location history|private location history|private whereabouts|current location)\b|\b(?:where|whereabouts)\s+(?:is|was)\s+(?:he|jawed(?:\s+imtiaz)?)\s+(?:now|currently|today|right now|yesterday|last night)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)'s|his|personal|private)\s+(?:passport|passport number|aadhaar|aadhaar number|pan card|pan number|driving licence|driving license|voter id|voter id number|identity document|identity documents|government id|government identification|id document|id documents|private identity details|identity details)\b|\b(?:what|which)\s+(?:is|are)\s+(?:his|jawed(?:\s+imtiaz)?)'?(?:s)?\s+(?:passport|aadhaar|pan|driving licence|driving license|voter id|government id)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)'s|his|personal|private)\s+(?:personal email|private email|personal phone|private phone|personal mobile|private mobile|personal address|private address|home address|residential address|personal contact details|private contact details|emergency contact|emergency contact details|personal contact information|private contact information)\b/,
    /\b(?:account recovery|recovery email|recovery phone|recovery code|backup code|two-factor code|two factor code|2fa code|authentication code|authenticator code|one-time password|otp|verification code|security code|reset code|password reset|account recovery details|recovery details)\b/ ,
    /\b(?:personal academic record(?:s)?|private academic record(?:s)?|academic transcript|school transcript|student id|student identification|exam result(?:s)?|exam score(?:s)?|test score(?:s)?|school grade(?:s)?|academic grade(?:s)?|personal grades?|private grades?)\b|\bwhat\s+(?:grades?|exam results?|test scores?)\s+did\s+(?:he|jawed(?:\s+imtiaz)?)\s+get\b/,
    /\b(?:private education history|personal education history|private school history|personal school history|private university history|personal university history|private college history|personal college history|school attended privately|university attended privately|college attended privately|private education details|personal education details)\b|\b(?:(?:where|which)\s+(?:school|university|college)\s+(?:did|has)\s+(?:he|jawed(?:\s+imtiaz)?)\s+(?:attend|attended)\s+(?:privately|personally)|(?:what|which)\s+private\s+(?:school|university|college)\s+(?:did|has)\s+(?:he|jawed(?:\s+imtiaz)?)\s+(?:attend|attended)|where\s+(?:did|has)\s+(?:he|jawed(?:\s+imtiaz)?)\s+(?:attend|attended)\s+(?:school|university|college)\s+(?:privately|personally))\b/,
    /\b(?:personal insurance|private insurance|personal insurance policy|private insurance policy|personal health insurance|private health insurance|health insurance policy(?: number)?|insurance policy number|insurance claim details?|insurance member id|insurance membership id)\b/,
    /\b(?:(?:what|which)\s+insurance\s+(?:does|has)\s+(?:jawed(?:\s+imtiaz)?|he)\b|\b(?:(?:jawed(?:\s+imtiaz)?)'s|his|personal|private)\s+(?:insurance coverage|insurance plan|insurance details|insurance benefits|insurance claim history|insurance claims history)\b)/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)\x27s|his|personal|private)\s+(?:relationship history|personal relationship history|private relationship history|private relationships?|personal relationships?|past personal relationships?|personal relationship records?|private relationship records?)\b|\b(?:what|which)\s+(?:private|personal)\s+(?:relationship|relationships|relationship history|relationship records?)\s+(?:does|did|has)\s+(?:he|jawed(?:\s+imtiaz)?)\b|\b(?:what|tell me about)\s+(?:his|jawed(?:\s+imtiaz)?)\s+past\s+personal\s+relationships?\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)\x27s|his|personal|private)\s+(?:hobbies?|personal hobbies?|private hobbies?|leisure activities?|personal leisure activities?|private leisure activities?)\b|\b(?:what|which)\s+(?:private|personal)\s+(?:hobbies?|leisure activities?)\s+(?:does|did|has)\s+(?:he|jawed(?:\s+imtiaz)?)\b|\b(?:what|tell me about)\s+(?:his|jawed(?:\s+imtiaz)?)\s+(?:personal|private)\s+hobbies?\b|\bwhich\s+hobbies?\s+does\s+(?:he|jawed(?:\s+imtiaz)?)\s+have\s+privately\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)\x27s|his|personal|private)\s+(?:social media history|private social media history|personal social media history|social media activity history|private social media activity|personal social media activity|social media records?)\b|\b(?:what|which)\s+(?:private|personal)\s+social media (?:history|activity|records?)\s+(?:does|did|has)\s+(?:he|jawed(?:\s+imtiaz)?)\b|\b(?:what|tell me about)\s+(?:his|jawed(?:\s+imtiaz)?)\s+(?:private|personal)\s+social media history\b|\bwhich\s+social media activity\s+has\s+(?:he|jawed(?:\s+imtiaz)?)\s+had\s+privately\b/,
    /\bwhich\s+(?:websites?|sites?)\s+has\s+(?:he|jawed(?:\s+imtiaz)?)\s+browsed\s+privately\b/,
    /\b(?:personal biometric(?: data| information| identifiers?)?|private biometric(?: data| information| identifiers?)?|biometric data|biometric information|biometric identifier(?:s)?|fingerprint(?: data| scan| record)?|face id|facial recognition data|facial recognition records?|facial biometric(?: data| information)?|iris scan|retina scan|voice biometric(?: data| information)?|voiceprint|private security biometric(?:s)?)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)\x27s|his|personal|private)\s+(?:diary|journal|private journal|personal journal|diary entries?|journal entries?|personal diary|private diary|personal notes?|private notes?|personal journal entries?|private journal entries?)\b|\b(?:what|which)\s+(?:private|personal)\s+(?:diary|journal|notes?)\s+(?:does|did|has)\s+(?:he|jawed(?:\s+imtiaz)?)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)\x27s|his|personal|private)\s+(?:wishlist|wish list|private wishlist|personal wishlist|saved wishlist|shopping wishlist|wishlist items?|wish list items?)\b|\b(?:what|which)\s+(?:private|personal)\s+(?:wishlist|wish list|wishlist items?|wish list items?)\s+(?:does|did|has)\s+(?:he|jawed(?:\s+imtiaz)?)\b| \bwhat\s+items?\s+(?:has|does)\s+(?:he|jawed(?:\s+imtiaz)?)\s+(?:saved|added)\s+to\s+(?:his\s+)?(?:private\s+)?wishlist\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)\x27s|his|personal|private)\s+(?:voice recordings?|audio recordings?|voice history|recording history|voice messages?|audio messages?|recorded voice|recorded audio|voice memos?|audio memos?|voice notes?|audio notes?|private recordings?|personal recordings?)\b|\b(?:what|which)\s+(?:voice recordings?|audio recordings?|voice messages?|audio messages?|recordings?)\s+(?:does|did|has)\s+(?:he|jawed(?:\s+imtiaz)?)\b[^?]*\b(?:privately|private|personally|personal)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)\x27s|his|personal|private)\s+(?:preferences?|personal preferences?|private preferences?|likes?|dislikes?|favorites?|favourites?|personal tastes?|private tastes?|personal choices?|private choices?)\b|\b(?:what|which)\s+(?:personal|private)\s+(?:preferences?|likes?|dislikes?|favorites?|favourites?|tastes?|choices?)\s+(?:does|did|has)\s+(?:he|jawed(?:\s+imtiaz)?)\b|\b(?:what|which)\s+(?:does|did)\s+(?:he|jawed(?:\s+imtiaz)?)\s+(?:personally|privately)\s+(?:like|prefer|dislike)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)\x27s|his|personal|private)\s+(?:device history|device records?|personal devices?|private devices?|device usage history|device activity history|device activity records?)\b|\b(?:what|which)\s+(?:devices?|device records?|device history)\s+(?:does|did|has)\s+(?:he|jawed(?:\s+imtiaz)?)\b[^?]*\b(?:privately|private|personally|personal)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)\x27s|his|personal|private)\s+(?:donations?|charitable donations?|charity donations?|charitable giving|charity giving|donation history|charity history|donation records?|charity records?|donation details?|charity details?)\b|\b(?:what|which)\s+(?:charities?|donations?)\s+(?:does|did|has)\s+(?:he|jawed(?:\s+imtiaz)?)\s+(?:support(?:ed)?|donate to|give to|contribute to)\s+(?:privately|personally)\b/,
    /\b(?:(?:jawed(?:\s+imtiaz)?)\x27s|his|personal|private)\s+(?:legal case|legal matter|court case|lawsuit|litigation|criminal record|arrest record|police complaint|police report|legal history)\b|\b(?:what|tell me about)\s+(?:his|jawed(?:\s+imtiaz)?)\s+(?:lawsuit|court case|legal case|criminal record)\b|\bwhat\s+lawsuit\s+does\s+(?:he|jawed(?:\s+imtiaz)?)\s+have\b/
  ];
  if(personalPatterns.some(pattern=>pattern.test(value)))return {reply:PERSONAL_BOUNDARY_REPLY,sources:[]};
  const recentUserMessages=Array.isArray(messages)?messages.filter(message=>message?.role==="user").slice(-3):[];
  const priorPersonal=recentUserMessages.slice(0,-1).some(message=>personalPatterns.some(pattern=>pattern.test(String(message.content||"").trim().toLowerCase())));
  const personalFollowUp=/^(?:really|really\?|are you sure|are you certain|sure\?|is that true|is that correct|correct\?|what do you mean|why\??|how do you know\??|what about that\??|what about him\??|what about her\??|tell me more|tell me more\??|what else\??|and then\??|then what\??)$/i.test(value);
  if(personalFollowUp&&priorPersonal)return {reply:PERSONAL_BOUNDARY_REPLY,sources:[]};

  const identity=["who is jawed","who is jawed imtiaz","who was jawed","who was jawed imtiaz","about jawed","about jawed imtiaz"];
  if(identity.includes(value)){
    const source=knowledgeEntry("/about/");
    return source&&isSafeSourceMetadata(source)?{reply:ensureAllowedSourceLink(source.summary,[source]),sources:[source]}:null;
  }
  const workQuestion=(value.startsWith("where ")||value.startsWith("what "))&&["work","working","job","employed","employer","employment","company","client"].some(term=>value.includes(term));
  if(workQuestion){
    const source=knowledgeEntry("/work/experience/");
    return source&&isSafeSourceMetadata(source)?{reply:ensureAllowedSourceLink(source.summary,[source]),sources:[source]}:null;
  }
  return null;
}


async function handlePost({request,env}){
  const id=requestId();
  if(!allowedOrigin(request))return failure("Origin not allowed.","AI_ORIGIN_NOT_ALLOWED",403,id);
  const limit=checkRateLimit(getClientKey(request));
  if(!limit.allowed)return failure("Too many requests. Please try again shortly.","AI_RATE_LIMITED",429,id,{retry_after:limit.retryAfter});
  if(request.headers.get("content-type")?.split(";")[0].toLowerCase()!=="application/json")return failure("Expected application/json.","AI_INVALID_CONTENT_TYPE",415,id);
  const declaredLength=Number(request.headers.get("content-length"));
  if(Number.isFinite(declaredLength)&&declaredLength>MAX_BODY_BYTES)return failure("Request is too large.","AI_REQUEST_TOO_LARGE",413,id);
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)return failure("Request is too large.","AI_REQUEST_TOO_LARGE",413,id);
  let body;
  try{body=JSON.parse(raw)}catch{return failure("Invalid JSON.","AI_INVALID_JSON",400,id);}
  if(!body||!Array.isArray(body.messages)||body.messages.length<1||body.messages.length>MAX_MESSAGES)return failure("Provide between 1 and 12 messages.","AI_INVALID_CONVERSATION",400,id);
  const messages=body.messages.map(m=>({role:m?.role,content:typeof m?.content==="string"?m.content.trim():""}));
  if(messages.some(m=>!["user","assistant"].includes(m.role)||!m.content||m.content.length>MAX_MESSAGE_CHARS))return failure("Each message must have a valid role and a non-empty message of 2,000 characters or fewer.","AI_INVALID_MESSAGE",400,id);
  if(!validConversation(messages))return failure("Conversation messages must alternate between user and assistant, starting with the user.","AI_INVALID_CONVERSATION",400,id);
  if(messages.at(-1).role!=="user")return failure("The latest message must be from the user.","AI_INVALID_CONVERSATION",400,id);

  const deterministic=deterministicIntentReply(messages.at(-1).content,messages);
  if(deterministic){
    return json({reply:deterministic.reply,sources:publicSourceReferences(deterministic.sources),model:"deterministic-site-intent",request_id:id},200,{"x-request-id":id});
  }

  let responseSources=[];
  try{
    const retrievalQuery=buildRetrievalQuery(messages);
    const sources=findRelevantKnowledge(retrievalQuery,5,{primaryQuery:messages.at(-1).content});
    responseSources=publicSources(sources);
  }catch(error){
    return failure("The AI knowledge service is temporarily unavailable.","AI_RETRIEVAL_ERROR",502,id);
  }
  if(!env?.AI||typeof env.AI.run!=="function"){
    console.warn(JSON.stringify({event:"ai_request_unconfigured",request_id:id,code:"AI_NOT_CONFIGURED",matched_count:responseSources.length}));
    return json({error:"AI service is not configured yet.",code:"AI_NOT_CONFIGURED",request_id:id,sources:publicSourceReferences(responseSources)},503,{"x-request-id":id});
  }

  try{
    const result=await generateGroundedReply({ai:env.AI,input:messages,sources:responseSources});
    console.info(JSON.stringify({event:"ai_request_success",request_id:id,matched_count:responseSources.length,model:result.model}));
    return json({reply:result.reply,sources:publicSourceReferences(responseSources),model:result.model,request_id:id},200,{"x-request-id":id});
  }catch(error){
    const status=Number.isInteger(error?.status)&&error.status>=400&&error.status<600?error.status:502;
    const diagnostic=typeof error?.category==="string"&&/^PROVIDER_(?:HTTP_(?:4\d\d|5\d\d)|TIMEOUT|NETWORK|INVALID_RESPONSE|RESPONSE_READ|RESPONSE_VALIDATION|ATTRIBUTION)$/.test(error.category)?error.category:"PROVIDER_UNKNOWN";
    const providerErrorCode=typeof error?.providerErrorCode==="string"&&/^[a-z0-9_.-]{1,80}$/i.test(error.providerErrorCode)?error.providerErrorCode:"";
    const message=providerErrorCode==="3036"
      ?"The AI free daily allocation has been reached. Please try again after the daily allocation resets."
      :providerErrorCode==="5035"
        ?"The selected AI model requires a paid Cloudflare Workers plan. The site is configured to use a free-eligible model; please check the deployment binding/model configuration."
        :status===504?"The AI service took too long to respond. Please try again shortly."
        :status===429?"AI service is temporarily busy. Please try again shortly.":"The AI service is temporarily unavailable.";
    console.error(JSON.stringify({event:"ai_request_failure",request_id:id,code:"AI_PROVIDER_ERROR",status,provider_status:status,provider_category:diagnostic,provider_content_type:typeof error?.providerContentType==="string"&&/^[\x20-\x7e]{1,128}$/.test(error.providerContentType)?error.providerContentType:"",provider_body_bytes:Number.isInteger(error?.providerBodyBytes)?error.providerBodyBytes:null,provider_stage:typeof error?.providerStage==="string"&&/^(?:FETCH|HEADERS|BODY|PARSE|HTTP_STATUS)$/.test(error.providerStage)?error.providerStage:"",provider_error_code:typeof error?.providerErrorCode==="string"&&/^[a-z0-9_.-]{1,80}$/i.test(error.providerErrorCode)?error.providerErrorCode:"",provider_retry_after_seconds:Number.isInteger(error?.providerRetryAfterSeconds)&&error.providerRetryAfterSeconds>=0&&error.providerRetryAfterSeconds<=86400?error.providerRetryAfterSeconds:null}));
    const responseStatus=status===429?429:status===504?504:502;
    return json({error:message,code:"AI_PROVIDER_ERROR",request_id:id,diagnostic},responseStatus,{"x-request-id":id,"x-ai-provider-diagnostic":diagnostic});
  }
}

export async function onRequestPost(context){
  const id=requestId();
  try{
    return await handlePost(context);
  }catch(error){
    const category="HANDLER_"+(error?.name==="TypeError"?"TYPE_ERROR":error?.name==="SyntaxError"?"SYNTAX_ERROR":"UNEXPECTED_ERROR");
    console.error(JSON.stringify({event:"ai_request_unhandled_failure",request_id:id,code:"AI_HANDLER_ERROR",category,error_name:typeof error?.name==="string"?error.name:"Error"}));
    return json({error:"The AI service is temporarily unavailable.",code:"AI_HANDLER_ERROR",request_id:id,diagnostic:category},502,{"x-request-id":id,"x-ai-handler-diagnostic":category});
  }
}

export async function onRequestGet({request,env}={}){
  const id=requestId();
  const configuration=aiConfigurationStatus(env);
  return json({
    ok:configuration==="configured",
    service:"jawed-ai",
    status:configuration==="configured"?"ready":"not_configured",
    configuration,
    model:DEFAULT_MODEL,
    knowledge_entries:knowledgeCount(),
    rate_limit:{requests:MAX_REQUESTS,window_seconds:WINDOW_MS/1000,best_effort:true},
    request_id:id
  },200,{"x-request-id":id,...corsHeaders(request)});
}

export async function onRequestOptions({request}={}){
  const origin=request?.headers?.get("origin");
  const headers={
    "access-control-allow-methods":"GET, POST, OPTIONS",
    "access-control-allow-headers":"content-type, authorization, x-requested-with",
    "access-control-max-age":"86400"
  };
  if(origin&&isAllowedOrigin(origin)){
    headers["access-control-allow-origin"]=origin;
  }
  return new Response(null,{status:204,headers});
}
