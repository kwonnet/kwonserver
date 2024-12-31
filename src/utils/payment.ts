export const get_tzx_usd_rate = (tzxAmount: number): number =>{
    return parseFloat((tzxAmount * 0.013).toFixed(2))
  }
  
  export const get_usd_tzx_rate = (usdAmount: number): number =>{
    return parseFloat((usdAmount / 0.013).toFixed(2))
  }