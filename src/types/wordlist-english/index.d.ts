declare module 'wordlist-english' {

    interface WordList {
        [key: string]: string[]
    }

    const wordlist: WordList 
    
    export default wordlist;
};
