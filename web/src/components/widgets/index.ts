// The widget host's lookup: a module contributes its widget here, and the
// dashboard renders whatever is active without knowing anything about it.
// Every activity tracker shares the one widget.

import type { ComponentType } from 'react';
import type { BuiltinSlug } from '@/lib/types';
import type { WidgetProps } from './types';
import { WeightWidget } from './WeightWidget';
import { CaloriesWidget } from './CaloriesWidget';
import { ReadingWidget } from './ReadingWidget';
import { RunningWidget } from './RunningWidget';
import { WritingWidget } from './WritingWidget';
import { SleepWidget } from './SleepWidget';
import { ActivityWidget } from './ActivityWidget';

export const WIDGETS: Record<BuiltinSlug, ComponentType<WidgetProps>> = {
  weight: WeightWidget,
  calories: CaloriesWidget,
  reading: ReadingWidget,
  running: RunningWidget,
  writing: WritingWidget,
  sleep: SleepWidget,
};

export function widgetFor(slug: string, kind?: string): ComponentType<WidgetProps> {
  if (kind === 'activity') return ActivityWidget;
  return WIDGETS[slug as BuiltinSlug] ?? ActivityWidget;
}

export type { WidgetProps };
