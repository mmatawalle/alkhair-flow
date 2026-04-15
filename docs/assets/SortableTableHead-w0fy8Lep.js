import{c as d,r as m,j as s,g as h}from"./index-COkDqxrU.js";import{c as f}from"./table-BNg2Z7wo.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=d("ArrowDown",[["path",{d:"M12 5v14",key:"s699le"}],["path",{d:"m19 12-7 7-7-7",key:"1idqje"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=d("ArrowUpDown",[["path",{d:"m21 16-4 4-4-4",key:"f6ql7i"}],["path",{d:"M17 20V4",key:"1ejh1v"}],["path",{d:"m3 8 4-4 4 4",key:"11wl7u"}],["path",{d:"M7 4v16",key:"1glfcx"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=d("ArrowUp",[["path",{d:"m5 12 7-7 7 7",key:"hav0vg"}],["path",{d:"M12 19V5",key:"x0mq9r"}]]);function b(r,c){const[e,l]=m.useState(c??{key:"",direction:null}),u=n=>{l(a=>a.key!==n?{key:n,direction:"asc"}:a.direction==="asc"?{key:n,direction:"desc"}:{key:"",direction:null})},t=m.useMemo(()=>!r||!e.key||!e.direction?r??[]:[...r].sort((n,a)=>{const o=n[e.key],i=a[e.key];if(o==null&&i==null)return 0;if(o==null)return 1;if(i==null)return-1;const p=typeof o=="string"?o.localeCompare(i):Number(o)-Number(i);return e.direction==="asc"?p:-p}),[r,e]);return{sort:e,toggleSort:u,sorted:t}}function g({label:r,sortKey:c,sort:e,onToggle:l,className:u}){const t=e.key===c;return s.jsx(f,{className:h("cursor-pointer select-none hover:text-foreground transition-colors",u),onClick:()=>l(c),children:s.jsxs("span",{className:"inline-flex items-center gap-1",children:[r,t&&e.direction==="asc"&&s.jsx(y,{className:"h-3 w-3"}),t&&e.direction==="desc"&&s.jsx(k,{className:"h-3 w-3"}),!t&&s.jsx(w,{className:"h-3 w-3 opacity-30"})]})})}export{g as S,b as u};
