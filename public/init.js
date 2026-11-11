// Example documents for fresh three accounts. threepane runs the init.js next
// to each static modules.json, so this one stands in for pkg-base's, which
// would also seed patternwitch (not one of three's packages).
const examples = ["./packages/codemirror-markdown/example.js"]

export default async function init(repo, folder) {
	for (const path of examples) {
		try {
			const mod = await import(new URL(path, import.meta.url).href)
			const result = await mod.default(repo)
			const links = (Array.isArray(result) ? result : [result]).filter(Boolean)
			if (links.length) {
				await folder.change(doc => {
					doc.docs.push(...links)
				})
			}
		} catch (err) {
			console.warn(`init: example ${path} failed`, err)
		}
	}
}
