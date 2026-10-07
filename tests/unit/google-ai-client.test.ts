import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({generate:vi.fn(),construct:vi.fn()}));
vi.unmock('@/utils/googleAi');
vi.mock('@google/genai',()=>({GoogleGenAI:class {models={generateContent:deps.generate};constructor(options:unknown){deps.construct(options);}}}));
beforeEach(()=>{vi.resetModules();deps.generate.mockReset();deps.construct.mockReset();vi.stubEnv('GOOGLE_API_KEY','test-only-google-key');vi.stubEnv('GEMINI_API_KEY','');});
afterEach(()=>vi.unstubAllEnvs());
it('lazily creates and reuses the direct Google client with the existing key and timeout',async()=>{
 const {getGoogleAi}=await import('@/utils/googleAi');expect(deps.construct).not.toHaveBeenCalled();
 expect(getGoogleAi()).toBe(getGoogleAi());expect(deps.construct).toHaveBeenCalledOnce();
 expect(deps.construct).toHaveBeenCalledWith({apiKey:'test-only-google-key',httpOptions:{timeout:15000}});
});
it('supports the Gemini key alias and does not initialize an unconfigured provider',async()=>{
 vi.stubEnv('GOOGLE_API_KEY','');const {getGoogleAi}=await import('@/utils/googleAi');expect(()=>getGoogleAi()).toThrow('not configured');
 vi.stubEnv('GEMINI_API_KEY','test-only-gemini-key');getGoogleAi();expect(deps.construct).toHaveBeenCalledWith(expect.objectContaining({apiKey:'test-only-gemini-key'}));
});
it('preserves the Gemini model, prompt and validated answer contract',async()=>{
 const {contentTopicClassifier}=await import('@/utils/helpers');
 deps.generate.mockResolvedValue({text:'{"answer":"technology","extra":"ignored"}'});
 expect(await contentTopicClassifier('AI art is changing creativity.')).toEqual({answer:'technology'});
 expect(deps.generate).toHaveBeenCalledWith(expect.objectContaining({model:'gemini-2.5-flash',contents:expect.stringContaining('AI art is changing creativity.'),config:expect.objectContaining({temperature:0.8,responseMimeType:'application/json'})}));
});
it.each([undefined,'not json','{"answer":1}'])('rejects empty or malformed provider output %s',async text=>{
 const {contentTopicClassifier}=await import('@/utils/helpers');deps.generate.mockResolvedValue({text});
 await expect(contentTopicClassifier('Content')).rejects.toThrow();
});
