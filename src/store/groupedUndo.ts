import { type Action } from '@reduxjs/toolkit';
import { groupByActionTypes, type StateWithHistory } from 'redux-undo';
import { v4 as uuidv4 } from 'uuid';

// See https://redux-undo.js.org/main/examples/undo-redo-batch-actions
export const groupedUndo = {
  _group: null as null | string,
  batch(callable: () => void, group = uuidv4()) {
    this._group = group;
    try {
      callable();
    } finally {
      this._group = null;
    }
  },
  init<RootState>(rawActions: Action['type'] | Action['type'][]) {
    const defaultGroupBy = groupByActionTypes(rawActions);
    return (action: Action, currentState: RootState, previousHistory: StateWithHistory<RootState>) => (
      this._group || defaultGroupBy(action, currentState, previousHistory)
    );
  },
};
