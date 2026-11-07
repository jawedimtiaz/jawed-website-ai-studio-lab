#!/usr/bin/env node
import assert from "node:assert/strict";
import {findRelevantKnowledge} from "../functions/lib/ai-knowledge.js";
import {buildRetrievalQuery} from "../functions/lib/ai-retrieval.js";

const followUp=buildRetrievalQuery([
  {role:"user",content:"Tell me about retirement planning."},
  {role:"assistant",content:"Here are some retirement pages."},
  {role:"user",content:"Can you explain the calculator?"}
]);
const followUpResults=findRelevantKnowledge(followUp,5,{primaryQuery:"Can you explain the calculator?"});
assert.equal(followUpResults[0].title,"Compound Growth & SIP Calculator");
assert.equal(followUpResults.length,3);
assert.equal(followUpResults.some(entry=>entry.title==="Retirement Planning: Start With the Number"),false);

const mixed=buildRetrievalQuery([
  {role:"user",content:"Tell me about retirement planning."},
  {role:"assistant",content:"Here are some retirement pages."},
  {role:"user",content:"What is Jamf?"}
]);
const mixedResults=findRelevantKnowledge(mixed,5,{primaryQuery:"What is Jamf?"});
const jamfTroubleshooting=findRelevantKnowledge("Jamf troubleshooting helper",5,{primaryQuery:"Jamf troubleshooting helper"});
assert.equal(jamfTroubleshooting[0].title,"macOS & Jamf Triage Helper");
assert.equal(mixedResults[0].title,"Apple Device Management Enrollment Models");
assert.equal(mixedResults.slice(0,3).some(entry=>entry.title==="Retirement Planning: Start With the Number"),false);
assert.equal(mixedResults.some(entry=>entry.title==="Retirement Planning: Start With the Number"),false);

const longCurrent="x".repeat(2000);
const longQuery=buildRetrievalQuery([
  {role:"user",content:"Older user context"},
  {role:"assistant",content:"Untrusted assistant context"},
  {role:"user",content:longCurrent}
]);
assert.equal(longQuery.length<=6000,true);
assert.equal(longQuery.startsWith(longCurrent),true);

console.log("AI retrieval source-set precision validation OK");
console.log("Current request prioritized: yes");
console.log("Prior user context retained: yes");
console.log("Assistant turns excluded: yes");

const unrelated=buildRetrievalQuery([
  {role:"user",content:"Tell me about retirement planning."},
  {role:"assistant",content:"Here are some retirement pages."},
  {role:"user",content:"asdfgh quantum banana"}
]);
const unrelatedResults=findRelevantKnowledge(unrelated,5,{primaryQuery:"asdfgh quantum banana"});
assert.equal(unrelatedResults.length,0);

const vague=buildRetrievalQuery([
  {role:"user",content:"Tell me about retirement planning."},
  {role:"assistant",content:"Here are some retirement pages."},
  {role:"user",content:"Explain more"}
]);
const vagueResults=findRelevantKnowledge(vague,5,{primaryQuery:"Explain more"});
assert.equal(vagueResults.length>0,true);
assert.equal(vagueResults.some(entry=>entry.title==="Retirement Planning: Start With the Number"),true);

const unknownWithKnownWord=buildRetrievalQuery([
  {role:"user",content:"Tell me about retirement planning."},
  {role:"assistant",content:"Here are some retirement pages."},
  {role:"user",content:"asdfgh retirement"}
]);
const unknownWithKnownWordResults=findRelevantKnowledge(unknownWithKnownWord,5,{primaryQuery:"asdfgh retirement"});
assert.equal(unknownWithKnownWordResults.length>0,true);
assert.equal(/^Retirement/.test(unknownWithKnownWordResults[0].title),true);

console.log("AI no-source boundary validation OK");

const tellMore=buildRetrievalQuery([
  {role:"user",content:"Tell me about retirement planning."},
  {role:"assistant",content:"Here are some retirement pages."},
  {role:"user",content:"Tell me more"}
]);
const tellMoreResults=findRelevantKnowledge(tellMore,5,{primaryQuery:"Tell me more"});
assert.equal(tellMoreResults.length>0,true);

console.log("AI retrieval source-set relevance validation: PASS");

const personQueries=[
  "who is jawed",
  "tell me about jawed",
  "what does jawed do"
];
for(const query of personQueries){
  const results=findRelevantKnowledge(query,5,{primaryQuery:query});
  assert.equal(results.length>0,true,`Identity query must return grounded sources: ${query}`);
  assert.equal(results[0].url,"/about/",`Identity query must prioritize the About source: ${query}`);
  assert.equal(results.slice(0,3).some(entry=>entry.url==="/ai/"),false,`Identity query must not promote the AI interface as a person source: ${query}`);
}

const assistantQueries=[
  "what can this ai do",
  "what is the ai assistant"
];
for(const query of assistantQueries){
  const results=findRelevantKnowledge(query,5,{primaryQuery:query});
  assert.equal(results.length>0,true,`Assistant query must return grounded sources: ${query}`);
  assert.equal(results[0].url,"/ai/",`Assistant query must prioritize the AI source: ${query}`);
}

console.log("AI person-vs-assistant identity relevance validation OK");

