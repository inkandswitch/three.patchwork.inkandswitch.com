import {mergeConfig} from "vite"
import config from "./vite.config.ts"
export default mergeConfig(config, {
	root: "/Users/chee/soft/inkandswitch/patchwork/three.patchwork.inkandswitch.com",
	plugins: [{name: "port", configResolved(c) { c.preview.port = 4317; c.preview.strictPort = true }}],
})
