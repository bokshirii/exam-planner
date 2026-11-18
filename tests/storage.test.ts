import {beforeEach,expect,it,vi} from 'vitest';
import {repository} from '../src/storage';
import {emptyState,schedule,progress,ruleAnalysis,type State} from '../src/core';
let data:Map<string,string>;
beforeEach(()=>{data=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});});
it('persists a real registration-analysis-plan-completion-replan workflow',()=>{
 const s=emptyState();s.exams=[{id:'e',name:'경제학',examDate:'2026-11-30',priority:2,color:'#3b82f6',studyScope:'Chapter 1~3, 복습',createdAt:'2026-11-17',notes:'',reviewDays:2}];
 s.tasks=ruleAnalysis(s.exams[0].studyScope).map((t,i)=>({...t,id:'t'+i,examId:'e',order:i,dependencies:t.dependencies.map(n=>'t'+n)}));
 s.sessions=schedule(s,'2026-11-17').sessions;expect(s.sessions.length).toBeGreaterThan(0);s.sessions[0].completed=true;const done={...s.sessions[0]};repository.save(s);const loaded=repository.load().state;expect(loaded).toEqual(s);expect(progress(loaded).done).toBe(done.plannedMinutes);const next:State={...loaded,sessions:schedule(loaded,'2026-11-18').sessions};expect(next.sessions).toContainEqual(done);repository.save(next);expect(repository.load().state).toEqual(next);
});
it('preserves malformed stored data and reports an error',()=>{data.set('exam-planner-v1','broken');expect(repository.load().error).toBeTruthy();expect(data.get('exam-planner-v1')).toBe('broken');});
it('rejects invalid calendar dates on backup restore',()=>{const s=emptyState();s.availability.dateOverrides['2026-02-30']=30;expect(()=>repository.validate(s)).toThrow();});
