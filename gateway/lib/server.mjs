import {createRouter} from "./router.mjs";
import {store} from "./store.mjs";
const route=createRouter({store});
export const serve=(request,name)=>route(request,name);
