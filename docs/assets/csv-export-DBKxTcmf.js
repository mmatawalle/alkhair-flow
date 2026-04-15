import{c as d}from"./index-COkDqxrU.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=d("Download",[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["polyline",{points:"7 10 12 15 17 10",key:"2ggqvy"}],["line",{x1:"12",x2:"12",y1:"15",y2:"3",key:"1vk2je"}]]);function y(a,s,l){const c=o=>{const e=String(o??"");return e.includes(",")||e.includes('"')||e.includes(`
`)?`"${e.replace(/"/g,'""')}"`:e},i=[s.map(c).join(","),...l.map(o=>o.map(c).join(","))].join(`
`),r=new Blob([i],{type:"text/csv;charset=utf-8;"}),t=URL.createObjectURL(r),n=document.createElement("a");n.href=t,n.download=a,n.click(),URL.revokeObjectURL(t)}export{u as D,y as d};
