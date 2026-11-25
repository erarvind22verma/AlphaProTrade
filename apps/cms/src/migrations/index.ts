import * as migration_20261124_194358 from './20261124_194358';
import * as migration_20261125_071631_add_individual_widget_subscriptions from './20261125_071631_add_individual_widget_subscriptions';

export const migrations = [
  {
    up: migration_20261124_194358.up,
    down: migration_20261124_194358.down,
    name: '20261124_194358',
  },
  {
    up: migration_20261125_071631_add_individual_widget_subscriptions.up,
    down: migration_20261125_071631_add_individual_widget_subscriptions.down,
    name: '20261125_071631_add_individual_widget_subscriptions'
  },
];
