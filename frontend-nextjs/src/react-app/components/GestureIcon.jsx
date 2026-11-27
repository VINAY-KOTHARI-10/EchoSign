import { Grab, Hand, HandHeart, HandMetal, Keyboard, Pointer, ThumbsDown, ThumbsUp } from 'lucide-react';

// Line icons for the phrase gestures, instead of emoji (emoji look different on every device).
const BY_ID = {
  Open_Palm: Hand,
  Thumb_Up: ThumbsUp,
  Thumb_Down: ThumbsDown,
  Pointing_Up: Pointer,
  Closed_Fist: Grab,
  Victory: HandMetal,
  ILoveYou: HandHeart,
};

export function GestureIcon({ id, size = 22 }) {
  const Icon = BY_ID[id] || Hand;
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" />;
}

// Small marker after a speaker's name that says how the caption was made.
export function SourceIcon({ source }) {
  if (source === 'SIGN') return <Hand size={13} strokeWidth={2} aria-label="by sign" style={{ marginLeft: 6, verticalAlign: '-2px' }} />;
  if (source === 'TEXT') return <Keyboard size={13} strokeWidth={2} aria-label="typed" style={{ marginLeft: 6, verticalAlign: '-2px' }} />;
  return null;
}
