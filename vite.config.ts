import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' — GitHub Pages ішкі жолында да, жергілікті файлда да жұмыс істейді
export default defineConfig({ base: './', plugins: [react()] });
