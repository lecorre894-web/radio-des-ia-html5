import {serve} from "../../../lib/server.mjs";
export default {fetch(request){return serve(request,"review");}};
