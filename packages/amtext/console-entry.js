import { patchworkFolder, zip, unzip, EXT, ROOT } from "./patchworkfolder.js";
import * as amtext from "./amtext.js";
window.patchworkFolder = Object.assign(patchworkFolder(), { amtext, zip, unzip, EXT, ROOT });
