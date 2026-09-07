// The widget host's lookup: a module contributes its widget here, and the
// dashboard renders whatever is active without knowing anything about it.

import type { ComponentType } from 'react';
import type { ModuleSlug } from '@/lib/types';
import type { WidgetProps } from './types';
import { WeightWidget } from './WeightWidget';
import { CaloriesWidget } from './CaloriesWidget';
import { ReadingWidget } from './ReadingWidget';
import { RunningWidget } from './RunningWidget';
import { WritingWidget } from './WritingWidget';
import { SleepWidget } from './SleepWidget';

export const WIDGETS: Record<ModuleSlug, ComponentType<WidgetProps>> = {
  weight: WeightWidget,
  calories: CaloriesWidget,
  reading: ReadingWidget,
  running: RunningWidget,
  writing: WritingWidget,
  sleep: SleepWidget,
};

export type { WidgetProps };
