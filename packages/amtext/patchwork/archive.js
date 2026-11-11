import * as Automerge from "@automerge/automerge";
import { getRegistry } from "@inkandswitch/patchwork-plugins";
import { patchworkFolder } from "../patchworkfolder.js";

// like patchwork-plugins' createDocOfDatatype2, but the new doc records only
// its type, the way the sideboard makes docs: no suggestedImportUrl saying
// where the datatype was loaded from
async function createDocOfDatatype(datatype, repo) {
  const handle = await repo.create();
  await handle.change(doc => {
    datatype.module.init(doc, repo);
    doc["@patchwork"] = { type: datatype.id };
  });
  return handle;
}

const folder = repo =>
  patchworkFolder({ repo, Automerge, plugins: { getRegistry, createDocOfDatatype2: createDocOfDatatype } });

/** the "patchwork:archive" interface: pack a doc into a download, unpack a file into a doc */
export const archive = {
  /** downloads `url` and every doc it reaches as a .patchworkfolder */
  download(repo, url) {
    return folder(repo).downloadFolder(url);
  },
  /** unpacks a .patchworkfolder into fresh docs, resolving with the root doc's url */
  async import(repo, file) {
    const { root } = await folder(repo).importFolder(file);
    return root;
  },
};
