import {z} from 'zod';
export const categories=['개념 학습','문제 풀이','기출문제','복습'] as const;
export const taskInput=z.object({title:z.string().trim().min(1).max(200),estimatedMinutes:z.number().int().min(1).max(6000),category:z.enum(categories),priority:z.number().int().min(1).max(3),dependencies:z.array(z.number().int().min(0)).max(100).default([]),uncertain:z.boolean().default(true)});
export const analysisSchema=z.object({tasks:z.array(taskInput).min(1).max(100)}).superRefine(({tasks},ctx)=>{tasks.forEach((t,i)=>t.dependencies.forEach(d=>{if(d>=i)ctx.addIssue({code:'custom',message:'선행 항목은 이전 항목이어야 합니다.'});}));});
export type TaskDraft=z.infer<typeof taskInput>;
export interface Exam {id:string;name:string;examDate:string;priority:number;color:string;studyScope:string;createdAt:string;reviewDays:number;notes:string}
export interface StudyTask extends Omit<TaskDraft,'dependencies'> {id:string;examId:string;dependencies:string[];order:number}
export interface StudySession {id:string;taskId:string;scheduledDate:string;plannedMinutes:number;completed:boolean;locked:boolean}
export interface StudyAvailability {weekdayAvailability:number[];dateOverrides:Record<string,number>;excludedDates:string[]}
export interface State {exams:Exam[];tasks:StudyTask[];sessions:StudySession[];availability:StudyAvailability}
export const emptyState=():State=>({exams:[],tasks:[],sessions:[],availability:{weekdayAvailability:[180,120,120,120,120,120,180],dateOverrides:{},excludedDates:[]}});
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function addDays(date:string,n:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export const daysBetween=(a:string,b:string)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
export const capacity=(a:StudyAvailability,d:string)=>a.excludedDates.includes(d)?0:(a.dateOverrides[d]??a.weekdayAvailability[new Date(d+'T12:00:00Z').getUTCDay()]);
export const uid=()=>crypto.randomUUID();
export function ruleAnalysis(input:string):TaskDraft[]{
 const result:TaskDraft[]=[];
 const push=(title:string,category:TaskDraft['category'],minutes:number)=>{if(result.length<100)result.push({title,category,estimatedMinutes:minutes,priority:2,dependencies:category==='복습'?result.map((_,i)=>i):[],uncertain:true});};
 for(const raw of input.split(/[\n,，;；]+|그리고|하고\s*/).map(s=>s.trim()).filter(Boolean)){
 const category=/복습|review/i.test(raw)?'복습':/기출|모의/.test(raw)?'기출문제':/문제|problem|set/i.test(raw)?'문제 풀이':'개념 학습';
 const range=raw.match(/(chapter|ch\.?|챕터|장|problem\s*set|문제셋|문제\s*세트)\s*(\d+)\s*[~～–-]\s*(\d+)/i);
 if(range&&+range[3]>=+range[2]&&+range[3]-+range[2]<80){for(let n=+range[2];n<=+range[3];n++)push(raw.replace(range[0],`${range[1]} ${n}`),category,category==='개념 학습'?60:45);}
 else {const count=raw.match(/(\d+)\s*(개|회)/);if(count&&+count[1]<=30&&category!=='복습'){for(let n=1;n<=+count[1];n++)push(`${raw} · ${n}/${count[1]}`,category,45);}else push(raw,category,category==='복습'?60:45);}
 }
 return result.length?result:[{title:'학습 범위 확인',estimatedMinutes:30,category:'개념 학습',priority:2,dependencies:[],uncertain:true}];
}
export interface Plan {sessions:StudySession[];unassigned:{taskId:string;minutes:number;reason:string}[];warnings:string[];required:number;available:number}
export function schedule(state:State,start=today()):Plan {
 const {exams,tasks,availability}=state;
 const sessions=state.sessions.filter(s=>s.completed||s.locked).map(s=>({...s}));
 const warnings:string[]=[];const used:Record<string,number>={};
 for(const s of sessions)used[s.scheduledDate]=(used[s.scheduledDate]??0)+s.plannedMinutes;
 for(const d of Object.keys(used))if(d>=start&&used[d]>capacity(availability,d))warnings.push(`${d}: 완료·고정 기록이 가용 시간을 초과합니다.`);
 const examMap=new Map(exams.map(e=>[e.id,e]));
 const remaining=new Map(tasks.map(t=>[t.id,Math.max(0,t.estimatedMinutes-sessions.filter(s=>s.taskId===t.id).reduce((a,s)=>a+s.plannedMinutes,0))]));
 const required=[...remaining.values()].reduce((a,b)=>a+b,0);
 const last=exams.reduce((m,e)=>e.examDate>m?e.examDate:m,start);
 const horizon=Math.min(Math.max(0,daysBetween(start,last)),3660);if(daysBetween(start,last)>3660)warnings.push('일정 생성 범위는 최대 10년입니다.');
 let available=0;
 for(let n=0;n<horizon;n++){
 const date=addDays(start,n);let free=Math.max(0,capacity(availability,date)-(used[date]??0));available+=free;
 while(free>0){
 const candidates=tasks.filter(t=>{
 const e=examMap.get(t.examId);if(!e||date>=e.examDate||!remaining.get(t.id))return false;
 if(t.category==='복습'&&e.reviewDays>0&&date<addDays(e.examDate,-e.reviewDays))return false;
 return t.dependencies.every(id=>remaining.has(id)&&remaining.get(id)===0&&!sessions.some(s=>s.taskId===id&&s.scheduledDate>date));
 }).sort((a,b)=>{const ea=examMap.get(a.examId)!,eb=examMap.get(b.examId)!;const urgency=(t:StudyTask,e:Exam)=>tasks.filter(x=>x.examId===e.id).reduce((s,x)=>s+(remaining.get(x.id)??0),0)/Math.max(1,daysBetween(date,e.examDate));return ea.examDate.localeCompare(eb.examDate)||urgency(b,eb)-urgency(a,ea)||eb.priority-ea.priority||b.priority-a.priority||a.order-b.order||a.id.localeCompare(b.id);});
 const t=candidates[0];if(!t)break;
 const minutes=Math.min(60,free,remaining.get(t.id)!);let i=1;while(sessions.some(s=>s.id===`${t.id}:${date}:${i}`))i++;
 sessions.push({id:`${t.id}:${date}:${i}`,taskId:t.id,scheduledDate:date,plannedMinutes:minutes,completed:false,locked:false});remaining.set(t.id,remaining.get(t.id)!-minutes);free-=minutes;
 }
 }
 const unassigned=tasks.filter(t=>remaining.get(t.id)!>0).map(t=>({taskId:t.id,minutes:remaining.get(t.id)!,reason:examMap.get(t.examId)?.examDate!<=start?'시험일이 지났거나 오늘입니다.':'가용 시간·복습 기간·선행 조건을 확인하세요.'}));
 return {sessions,unassigned,warnings,required,available};
}
export function progress(state:State,examId?:string){const ids=new Set(state.tasks.filter(t=>!examId||t.examId===examId).map(t=>t.id));const total=state.tasks.filter(t=>ids.has(t.id)).reduce((a,t)=>a+t.estimatedMinutes,0);const done=state.sessions.filter(s=>ids.has(s.taskId)&&s.completed).reduce((a,s)=>a+s.plannedMinutes,0);return {total,done,percent:total?Math.min(100,Math.round(done/total*100)):0};}
