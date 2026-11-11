// three's themes: a warmed lattice light for the day, an amber vt100 for the
// night, and a xerox alto for a 1-bit day
const themes = [
	{id: "three-light", name: "Light", colorScheme: "light"},
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
