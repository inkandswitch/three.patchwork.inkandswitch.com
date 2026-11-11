// three's two themes: a xerox alto for the day, an amber vt100 for the night
const themes = [
	{id: "three-alto", name: "Alto", colorScheme: "light"},
	{id: "three-amber", name: "Amber", colorScheme: "dark"},
]

export const plugins = themes.map(theme => ({
	type: "patchwork:theme",
	id: theme.id,
	name: theme.name,
	colorScheme: theme.colorScheme,
	style: new URL("./three.css", import.meta.url).href,
	async load() {
		return {}
	},
}))
