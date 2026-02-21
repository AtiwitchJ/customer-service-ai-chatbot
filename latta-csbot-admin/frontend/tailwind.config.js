/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{html,ts}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: { "primary": "#ffde59", "primary-hover": "#e6c850", "surface-dark": "#27272a" },
            fontFamily: { "display": ["Spline Sans", "sans-serif"] }
        },
    },
    plugins: [],
}
