import { type ComponentType, type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import cx from 'classnames';

import { useFontQuery, type QueryOptions } from './useFontQuery';
import { registerFontSettingsProperties } from './registerFontSettingsProperties';

const FONT_SETTINGS_BORDER_ANIMATION_DURATION = 1000;

registerFontSettingsProperties();

export type SubFormProps<SubformState> = { setSubFormNotEmpty: Dispatch<SetStateAction<boolean>>, state: SubformState };

export function ExternalFontSubForm<SubformState>(
  { visible: visibleProp, subform: Subform, subformState, queryOptions }:
  { visible: boolean, subform: ComponentType<SubFormProps<SubformState>>, subformState: SubformState, queryOptions: QueryOptions }
) {
  const [visible, setVisible] = useState(visibleProp);
  const [subFormNotEmpty, setSubFormNotEmpty] = useState(false);
  const [haveFocus, setHaveFocus] = useState(false);

  const { status } = useFontQuery({ ...queryOptions, enabled: false });

  useEffect(() => {
    setVisible(visibleProp || subFormNotEmpty || haveFocus);
  }, [visibleProp, subFormNotEmpty, haveFocus]);

  return (
    <fieldset
      className={cx(
        { hidden: !visible },
        subFormNotEmpty ? status : 'idle',
      )}
      onAnimationStart={(e) => {
        // Because of the timeout and given the event bubbles, the `currentTarget` will change, so we must capture it first
        const target = e.currentTarget;
        // Change the timing function to linear at the point where the bezier curve is essentially linear
        setTimeout(() => {
          target.style.setProperty('animation-timing-function', 'linear');
        }, FONT_SETTINGS_BORDER_ANIMATION_DURATION * 0.75);
      }}
      onAnimationEnd={(e) => {
        e.currentTarget.style.removeProperty('animation-timing-function');
      }}
      onFocus={() => setHaveFocus(true)}
      onBlur={() => setHaveFocus(false)}
    >
      <Subform setSubFormNotEmpty={setSubFormNotEmpty} state={subformState} />
    </fieldset>
  );
}
