// The message under a form field when validation fails. `id` should match the field's aria-describedby.
export default function FieldError({ id, message }) {
  if (!message) return null;
  return <span id={id} className="tw-text-[13px] tw-font-bold tw-leading-snug tw-text-[#b42318]" role="alert">{message}</span>;
}
