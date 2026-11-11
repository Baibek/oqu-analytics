import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base: './' — GitHub Pages ішкі жолында да, жергілікті файлда да жұмыс істейді
export default defineConfig({
  base: './',
  plugins: [react()],
  // Агенттердің уақытша worktree көшірмелеріндегі тесттерді іске қоспаймыз
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
});
