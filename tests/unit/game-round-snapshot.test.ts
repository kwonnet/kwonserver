import {expect,it,vi} from 'vitest';
vi.mock('@/db',()=>({default:{}}));
vi.mock('@/redis',()=>({default:{}}));
vi.mock('@/services/v1/games/energy',()=>({applyRoundGameEnergy:vi.fn(),syncGameEnergy:vi.fn()}));
import {normalizeRoundSnapshot} from '@/services/v1/games/rounds';
const question={id:'q',roundId:'r',question:'Test',answer:'Test',type:'MINDMASH',options:{},acceptedAnswers:{}};
it('normalizes empty Lua answer, receipt and question arrays on every retry',()=>{
 const input={question,answers:{},actionIds:{}};
 const normalized=normalizeRoundSnapshot(input);
 expect(normalized.answers).toEqual([]);expect(normalized.actionIds).toEqual([]);
 expect(normalized.question.options).toEqual([]);expect(normalized.question.acceptedAnswers).toEqual([]);
 expect(normalizeRoundSnapshot(normalized)).toEqual(normalized);
 expect(input.answers).toEqual({});
});
it('normalizes nested empty votes and guesses while preserving nonempty answers',()=>{
 const answer={playerId:'player',answer:'test',votes:{},answers:{},timer:5};
 const result=normalizeRoundSnapshot({question,answers:[answer],actionIds:['receipt']});
 expect(result.answers[0]).toEqual({...answer,votes:[],answers:[]});
 expect(result.actionIds).toEqual(['receipt']);
});
it.each(['answers','actionIds'])('does not hide malformed nonempty %s objects',field=>{
 expect(()=>normalizeRoundSnapshot({question,answers:[],[field]:{unexpected:'data'}})).toThrow(`Invalid round snapshot ${field}`);
});
