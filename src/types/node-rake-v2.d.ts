declare module 'node-rake-v2' {
    export interface Options {
      stopwords?: string[];
      removeDuplicates?: boolean;
    }
  
    interface Rake {
      generate(content: string, options?: Options): string[];
      addStopWords(stopwords: string[]): void;
    }
  
    const rake: Rake;
    export default rake;
  }
  