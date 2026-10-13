export const pretty=s=>(s||"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
export const num=n=>n==null || !Number.isFinite(Number(n))?"Not available":Number(n).toFixed(1);
export const initial={mode:"new",vendorId:"",business:"vegetable_fruit",division:"",excludeZone:""};
