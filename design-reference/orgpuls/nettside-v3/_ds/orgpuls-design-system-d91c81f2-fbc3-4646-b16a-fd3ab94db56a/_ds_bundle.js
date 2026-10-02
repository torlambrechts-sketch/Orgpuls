/* @ds-bundle: {"format":4,"namespace":"OrgpulsDesignSystem_d91c81","components":[{"name":"AccountChip","sourcePath":"components/core/AccountChip.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"CountBadge","sourcePath":"components/core/CountBadge.jsx"},{"name":"Eyebrow","sourcePath":"components/core/Eyebrow.jsx"},{"name":"ICON_PATHS","sourcePath":"components/core/Icon.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"Logo","sourcePath":"components/core/Logo.jsx"},{"name":"Pill","sourcePath":"components/core/Pill.jsx"},{"name":"Segmented","sourcePath":"components/core/Segmented.jsx"},{"name":"Switch","sourcePath":"components/core/Switch.jsx"},{"name":"Tick","sourcePath":"components/core/Tick.jsx"},{"name":"HeatTone","sourcePath":"components/data/HeatTile.jsx"},{"name":"HeatTile","sourcePath":"components/data/HeatTile.jsx"},{"name":"MaskedCell","sourcePath":"components/data/MaskedCell.jsx"},{"name":"Meter","sourcePath":"components/data/Meter.jsx"},{"name":"RateColour","sourcePath":"components/data/Meter.jsx"},{"name":"BAND_LABEL","sourcePath":"components/data/RiskBadge.jsx"},{"name":"BAND_BAR","sourcePath":"components/data/RiskBadge.jsx"},{"name":"RiskBadge","sourcePath":"components/data/RiskBadge.jsx"},{"name":"StackedBar","sourcePath":"components/data/StackedBar.jsx"},{"name":"StatusPill","sourcePath":"components/data/StatusPill.jsx"},{"name":"TypePill","sourcePath":"components/data/TypePill.jsx"},{"name":"CheckCard","sourcePath":"components/forms/CheckCard.jsx"},{"name":"CheckRow","sourcePath":"components/forms/CheckRow.jsx"},{"name":"ChoiceOption","sourcePath":"components/forms/ChoiceOption.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"FIELD_SIZE","sourcePath":"components/forms/Input.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Mark","sourcePath":"components/forms/Mark.jsx"},{"name":"RadioCard","sourcePath":"components/forms/RadioCard.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"Card","sourcePath":"components/surfaces/Card.jsx"},{"name":"Modal","sourcePath":"components/surfaces/Modal.jsx"},{"name":"NoteCard","sourcePath":"components/surfaces/NoteCard.jsx"},{"name":"Row","sourcePath":"components/surfaces/Row.jsx"},{"name":"Section","sourcePath":"components/surfaces/Section.jsx"}],"sourceHashes":{"components/core/AccountChip.jsx":"b9c0be48d575","components/core/Button.jsx":"a0f27537db61","components/core/Chip.jsx":"bcd55b79eff8","components/core/CountBadge.jsx":"db251f6b69c0","components/core/Eyebrow.jsx":"9239d21bd133","components/core/Icon.jsx":"2d1e71d33b3f","components/core/Logo.jsx":"9b9a90468aa4","components/core/Pill.jsx":"f58734f24fb5","components/core/Segmented.jsx":"bac42c12fd4e","components/core/Switch.jsx":"9b6ce045aba3","components/core/Tick.jsx":"ef21681e60e7","components/data/HeatTile.jsx":"2e8968d6c2f7","components/data/MaskedCell.jsx":"51a9703d3d0e","components/data/Meter.jsx":"614138d9699a","components/data/RiskBadge.jsx":"e84c2268f890","components/data/StackedBar.jsx":"62b85985414e","components/data/StatusPill.jsx":"027b6476dcac","components/data/TypePill.jsx":"8235af26c1e0","components/forms/CheckCard.jsx":"467612663d18","components/forms/CheckRow.jsx":"9f9305758ba2","components/forms/ChoiceOption.jsx":"08f127a21899","components/forms/Field.jsx":"44841c6dfb63","components/forms/Input.jsx":"6f1b34939a8f","components/forms/Mark.jsx":"77e43539f3bb","components/forms/RadioCard.jsx":"cd501fddc63d","components/forms/Select.jsx":"9ae06e999355","components/forms/Textarea.jsx":"7b30aa51d8b4","components/surfaces/Card.jsx":"7716e871ffe4","components/surfaces/Modal.jsx":"2d12ca2e4101","components/surfaces/NoteCard.jsx":"b5839479b9be","components/surfaces/Row.jsx":"6ba7d2292e4a","components/surfaces/Section.jsx":"4300caec4f9f","ui_kits/app/Home.jsx":"05c8f5546a92","ui_kits/app/Measure.jsx":"a63d3b97750b","ui_kits/app/Shell.jsx":"428ee0899eec","ui_kits/app/Work.jsx":"e761b1c68c71","ui_kits/app/data.js":"2f2f8bfb7945","ui_kits/app/main.jsx":"641a391abe6b","ui_kits/respond/Respond.jsx":"787f76ab17a6","ui_kits/site/Pages.jsx":"f00e0ad5bb39","ui_kits/site/SiteShell.jsx":"b6f45d656521","ui_kits/site/main.jsx":"55ffc7bcd542"},"inlinedExternals":[],"unexposedExports":[{"name":"fieldStyle","sourcePath":"components/forms/Input.jsx"},{"name":"heatTone","sourcePath":"components/data/HeatTile.jsx"},{"name":"rateColour","sourcePath":"components/data/Meter.jsx"}]} */

(() => {

const __ds_ns = (window.OrgpulsDesignSystem_d91c81 = window.OrgpulsDesignSystem_d91c81 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/AccountChip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** The account chip (shell/AccountMenu.tsx): a 32px round mark with the viewer's initials, ringed when its menu is open or on Oppsett. */
function AccountChip({
  initials = '?',
  active = false,
  size = 32,
  label,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": label,
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: size,
      width: size,
      borderRadius: 999,
      border: 'none',
      cursor: 'pointer',
      fontFamily: 'inherit',
      background: 'var(--op-sbg)',
      fontSize: 12,
      fontWeight: 700,
      color: 'var(--op-ink)',
      boxShadow: active ? '0 0 0 1.5px var(--op-ink)' : 'none',
      padding: 0
    }
  }, rest), initials);
}
Object.assign(__ds_scope, { AccountChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/AccountChip.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Orgpuls button scale — transcribed from components/ui/Button.tsx. Eight sizes, five tones; the tone sets the weight. */
const SIZE = {
  lg: {
    h: 44,
    px: 20,
    r: 12,
    fs: 14.5
  },
  md: {
    h: 42,
    px: 18,
    r: 11,
    fs: 14
  },
  panel: {
    h: 40,
    px: 17,
    r: 11,
    fs: 13
  },
  sm: {
    h: 36,
    px: 16,
    r: 10,
    fs: 12.5
  },
  xs: {
    h: 34,
    px: 15,
    r: 9,
    fs: 12.5
  },
  act: {
    h: 34,
    px: 13,
    r: 9,
    fs: 12
  },
  xxs: {
    h: 32,
    px: 13,
    r: 9,
    fs: 12.5
  },
  tiny: {
    h: 30,
    px: 13,
    r: 9,
    fs: 12
  }
};
const TONE = {
  primary: {
    bg: 'var(--op-ac)',
    bc: 'var(--op-ink)',
    c: 'var(--op-ink)',
    fw: 700
  },
  secondary: {
    bg: 'transparent',
    bc: 'var(--op-line)',
    c: 'var(--op-ink)',
    fw: 600
  },
  quiet: {
    bg: 'var(--op-sf)',
    bc: 'var(--op-ink)',
    c: 'var(--op-ink)',
    fw: 700
  },
  solid: {
    bg: 'var(--op-ink)',
    bc: 'var(--op-ink)',
    c: 'var(--op-sf)',
    fw: 600
  },
  ghost: {
    bg: 'transparent',
    bc: 'var(--op-line)',
    c: 'var(--op-mut)',
    fw: 600
  },
  danger: {
    bg: 'transparent',
    bc: 'var(--op-orange)',
    c: '#8A3A16',
    fw: 600
  }
};
function Button({
  size = 'md',
  tone = 'primary',
  pad,
  href,
  disabled,
  block,
  style,
  children,
  ...rest
}) {
  const s = SIZE[size] || SIZE.md;
  const t = TONE[tone] || TONE.primary;
  const base = {
    display: block ? 'flex' : 'inline-flex',
    width: block ? '100%' : undefined,
    flex: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    cursor: disabled ? 'default' : 'pointer',
    height: s.h,
    paddingInline: pad === undefined ? s.px : pad,
    borderRadius: s.r,
    fontSize: s.fs,
    fontWeight: t.fw,
    background: t.bg,
    border: '1px solid ' + t.bc,
    color: t.c,
    textDecoration: 'none',
    fontFamily: 'inherit',
    lineHeight: 'normal',
    opacity: disabled ? 0.55 : 1,
    boxSizing: 'border-box',
    ...style
  };
  if (href) return /*#__PURE__*/React.createElement("a", _extends({
    href: href,
    "aria-disabled": disabled || undefined,
    style: base
  }, rest), children);
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: disabled,
    style: base
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
/** A chip that is really a radio or a checkbox (maleoppsett/controls.tsx Chip, tiltak/MeasureCard.tsx Choice). */
function Chip({
  type = 'checkbox',
  name,
  value,
  label,
  checked = false,
  disabled,
  height = 34,
  padding = 15,
  fontSize = 12.5,
  onChange,
  children
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      flex: 'none',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: type,
    name: name,
    value: value,
    checked: checked,
    disabled: disabled,
    onChange: onChange || (() => {}),
    style: {
      position: 'absolute',
      width: 1,
      height: 1,
      overflow: 'hidden',
      opacity: 0,
      margin: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 999,
      color: 'var(--op-ink)',
      height,
      paddingInline: padding,
      fontSize,
      cursor: disabled ? 'not-allowed' : 'pointer',
      border: '1px solid ' + (checked ? 'var(--op-ink)' : 'var(--op-line)'),
      background: checked ? 'var(--op-sbg)' : 'transparent',
      fontWeight: checked ? 700 : 500,
      opacity: disabled ? 0.55 : 1
    }
  }, label || children));
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/core/CountBadge.jsx
try { (() => {
/** The count badge on Kommentarer (shell/AppNav.tsx): rust fill, card-surface figure. 20px in the top bar, 18px in the side rail. */
function CountBadge({
  count,
  size = 20
}) {
  if (!count) return null;
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: size,
      minWidth: size,
      borderRadius: 999,
      background: 'var(--op-rustbar)',
      paddingInline: size >= 20 ? 6 : 5,
      fontSize: size >= 20 ? 11 : 10.5,
      fontWeight: 700,
      lineHeight: 1,
      color: 'var(--op-sf)'
    }
  }, count);
}
Object.assign(__ds_scope, { CountBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/CountBadge.jsx", error: String((e && e.message) || e) }); }

// components/core/Eyebrow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** The small uppercase label over a heading or a panel: 11px, .11em (app) or .12em (site), muted. */
function Eyebrow({
  variant = 'app',
  as = 'span',
  style,
  children,
  ...rest
}) {
  const Tag = as;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    style: {
      display: 'block',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: variant === 'site' ? '0.12em' : '0.11em',
      color: 'var(--op-mut)',
      fontWeight: 400,
      margin: 0,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Eyebrow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Eyebrow.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
/** The admin menu's line icons (components/admin/icons.tsx): 16px drawings on a 24 grid, stroked in currentColor at 1.8. Decorative — the control carries the name. */
const ICON_PATHS = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  building: 'M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 10h3a1 1 0 0 1 1 1v10M3 21h18M8 8h3M8 12h3M8 16h3',
  pulse: 'M3 12h4l2-5 4 10 2-5h6',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  ticket: 'M4 8a2 2 0 0 0 0 4v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a2 2 0 0 1 0-4V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1zM14 4v13',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 12h.01',
  kanban: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v6h-4z',
  inbox: 'M4 13l2.5-8h11L20 13v6H4zM4 13h5l1 2h4l1-2h5',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  contacts: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M8.5 17a3.5 3.5 0 0 1 7 0M4 7h2M4 12h2M4 17h2',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  filter: 'M4 5h16l-6 7.5V19l-4 1v-7.5z',
  template: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  coins: 'M9 11a5 3 0 1 0 0-.01M4 11v4c0 1.66 2.24 3 5 3s5-1.34 5-3v-4M14 7.3c.6-.2 1.3-.3 2-.3 2.76 0 5 1.34 5 3v4c0 1.4-1.6 2.6-3.8 2.9',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  puzzle: 'M9 4h4v2a1.5 1.5 0 0 0 3 0V4h4v4h-2a1.5 1.5 0 0 0 0 3h2v4h-4v-2a1.5 1.5 0 0 0-3 0v2H9v-4H7a1.5 1.5 0 0 1 0-3h2zM9 15v5h11v-5',
  scale: 'M12 4v16M8 20h8M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3',
  activity: 'M4 12h3l3 7 4-14 3 7h3',
  log: 'M8 4h8l3 3v13H5V4zM9 10h6M9 14h6M9 18h3',
  shield: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6zM9 12l2 2 4-4',
  collapse: 'M15 6l-6 6 6 6',
  expand: 'M9 6l6 6-6 6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  chevron: 'M6 9l6 6 6-6',
  page: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5a1 1 0 1 0 0-.01',
  redirect: 'M4 17V9a3 3 0 0 1 3-3h11M15 3l3 3-3 3M20 21H10',
  close: 'M6 6l12 12M18 6L6 18',
  signout: 'M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 16l-4-4 4-4M6 12h10'
};
function Icon({
  name,
  size = 16,
  style
}) {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      display: 'block',
      flex: 'none',
      ...style
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: ICON_PATHS[name] || ''
  }));
}
Object.assign(__ds_scope, { ICON_PATHS, Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Logo.jsx
try { (() => {
/** The Orgpuls mark (shell/Logo.tsx): a pulse polyline with a trailing dot in a rounded square (r9, 1.5px ink), with the Playfair wordmark. Path data is the design's. */
function Logo({
  size = 30,
  wordmark = 19,
  markOnly = false,
  src = null,
  radius
}) {
  const w = size >= 30 ? 20 : 19,
    h = size >= 30 ? 12 : 11;
  const mark = src ? /*#__PURE__*/React.createElement("span", {
    role: "img",
    "aria-label": "Logo",
    style: {
      display: 'block',
      flex: 'none',
      width: size,
      height: size,
      borderRadius: radius || 9,
      background: '#FFFDF6 url(' + src + ') center/contain no-repeat'
    }
  }) : /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flex: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      borderRadius: radius || 9,
      border: '1.5px solid var(--op-ink)',
      background: size >= 30 ? '#FFFDF6' : '#FCF6E9',
      boxSizing: 'border-box'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size >= 33 ? 22 : w,
    height: size >= 33 ? 13 : h,
    viewBox: "0 0 20 12",
    fill: "none",
    "aria-hidden": "true",
    style: {
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 6.2h3.6l1.7-4.4 2.9 8.8 1.9-4.4h2.4",
    stroke: "#191510",
    strokeWidth: "1.7",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "17",
    cy: "6.2",
    r: "1.9",
    fill: "#191510"
  })));
  if (markOnly) return mark;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flex: 'none',
      alignItems: 'center',
      gap: 9,
      color: 'var(--op-ink)'
    }
  }, mark, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      letterSpacing: '-0.01em',
      fontSize: wordmark,
      whiteSpace: 'nowrap'
    }
  }, "Orgpuls"));
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Logo.jsx", error: String((e && e.message) || e) }); }

// components/core/Pill.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** The filter/tab pill (components/ui/Pill.tsx): padding 7px 14px, fully round, 12.5px, line-height 1. */
function Pill({
  selected = false,
  style,
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-pressed": selected,
    style: {
      display: 'inline-flex',
      flex: 'none',
      alignItems: 'center',
      borderRadius: 999,
      padding: '7px 14px',
      fontSize: 12.5,
      lineHeight: 1,
      color: 'var(--op-ink)',
      cursor: 'pointer',
      fontFamily: 'inherit',
      border: '1px solid ' + (selected ? 'var(--op-ink)' : 'var(--op-rule)'),
      background: selected ? 'var(--op-sf)' : 'transparent',
      fontWeight: selected ? 700 : 500,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Pill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Pill.jsx", error: String((e && e.message) || e) }); }

// components/core/Segmented.jsx
try { (() => {
/** The Enkel/Full switch (HeaderBar.tsx) and the header-panel tab row — two variants of one segmented control. */
function Segmented({
  options = [],
  value,
  onChange,
  variant = 'mode',
  ariaLabel
}) {
  const panel = variant === 'panel';
  return /*#__PURE__*/React.createElement("span", {
    role: "group",
    "aria-label": ariaLabel,
    style: {
      display: 'flex',
      gap: panel ? 4 : 0,
      borderRadius: panel ? 11 : 9,
      background: panel ? 'rgba(25,21,16,.06)' : 'var(--op-track)',
      padding: panel ? 3 : 2,
      width: 'fit-content'
    }
  }, options.map(o => {
    const on = o.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: o.value,
      type: "button",
      "aria-pressed": on,
      onClick: () => !on && onChange && onChange(o.value),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        cursor: 'pointer',
        border: 'none',
        fontFamily: 'inherit',
        borderRadius: panel ? 8 : 7,
        padding: panel ? '6px 13px' : '6px 11px',
        fontSize: panel ? 12.5 : 12,
        fontWeight: panel ? on ? 700 : 500 : 700,
        color: panel ? 'var(--op-ink)' : on ? 'var(--op-bg)' : 'var(--op-mut)',
        background: on ? panel ? 'var(--op-sf)' : 'var(--op-ink)' : 'transparent'
      }
    }, o.icon ? /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        display: 'block',
        width: 20,
        height: 20,
        borderRadius: 7,
        background: 'var(--op-bg) url(' + o.icon + ') center/cover no-repeat'
      }
    }) : null, o.label);
  }));
}
Object.assign(__ds_scope, { Segmented });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Segmented.jsx", error: String((e && e.message) || e) }); }

// components/core/Switch.jsx
try { (() => {
/** The design's switch (admin/SettingsSwitch.tsx): a 38×22 track, the knob at 2 or 18px. */
function Switch({
  on = false,
  onChange,
  label,
  disabled
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    role: "switch",
    "aria-checked": on,
    "aria-label": label,
    disabled: disabled,
    onClick: () => onChange && onChange(!on),
    style: {
      position: 'relative',
      display: 'block',
      height: 22,
      width: 38,
      flex: 'none',
      borderRadius: 999,
      border: 0,
      padding: 0,
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      background: on ? 'var(--op-ink)' : 'rgba(25,21,16,.15)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 2,
      left: on ? 18 : 2,
      display: 'block',
      width: 18,
      height: 18,
      borderRadius: 999,
      background: 'var(--op-sf)',
      transition: 'left 150ms'
    }
  }));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Switch.jsx", error: String((e && e.message) || e) }); }

// components/core/Tick.jsx
try { (() => {
/** The mint tick: a ✓ in a soft-mint square (site/parts.tsx Tick, 16 or 18) or disc (respondent promises 20, the law line 26). */
function Tick({
  size = 18,
  round = false,
  inverted = false
}) {
  const r = round ? 999 : size <= 16 ? 5 : 6;
  const fs = size >= 26 ? 13 : size >= 20 ? 11 : size <= 16 ? 9 : 10;
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'flex',
      flex: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      borderRadius: r,
      fontSize: fs,
      fontWeight: 700,
      marginTop: round ? 0 : 2,
      background: inverted ? 'var(--op-greendeep)' : 'var(--op-mint)',
      color: inverted ? 'var(--op-mint)' : 'var(--op-greendeep)',
      lineHeight: 'normal'
    }
  }, "\u2713");
}
Object.assign(__ds_scope, { Tick });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tick.jsx", error: String((e && e.message) || e) }); }

// components/data/HeatTile.jsx
try { (() => {
/** Heat-map tone (lib/results/tone.ts heatTone): five steps so a 31 reads against a 47 at a glance. */
function heatTone(index) {
  if (index < 40) return {
    bg: '#E38258',
    fg: '#4A1706'
  };
  if (index < 50) return {
    bg: '#EC9B77',
    fg: '#5E1F09'
  };
  if (index < 62) return {
    bg: '#F5DC96',
    fg: '#5C4600'
  };
  if (index < 72) return {
    bg: '#CFE7E4',
    fg: '#20431C'
  };
  return {
    bg: '#B5DAD4',
    fg: '#20431C'
  };
}
/** Capitalised alias so the helper lands on the window namespace (lower-case exports stay bundle-internal). */
const HeatTone = heatTone;
function HeatTile({
  index,
  masked = false,
  size = 'score',
  selected = false,
  onClick,
  style
}) {
  const t = masked ? {
    bg: 'rgba(25,21,16,.05)',
    fg: 'var(--op-mut)'
  } : heatTone(index);
  const cell = size === 'cell';
  const Tag = onClick ? 'button' : 'span';
  return /*#__PURE__*/React.createElement(Tag, {
    type: onClick ? 'button' : undefined,
    onClick: onClick,
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: cell ? 10 : 7,
      fontWeight: 700,
      fontSize: cell ? 15 : 15,
      background: t.bg,
      color: t.fg,
      fontFamily: 'inherit',
      cursor: onClick ? 'pointer' : 'default',
      width: cell ? '100%' : 36,
      height: cell ? 56 : undefined,
      padding: cell ? 0 : '2px 0',
      border: selected ? '2px solid var(--op-ink)' : cell ? '2px solid transparent' : 'none',
      boxSizing: 'border-box',
      fontVariantNumeric: 'tabular-nums',
      ...style
    }
  }, masked ? '—' : index);
}
Object.assign(__ds_scope, { heatTone, HeatTone, HeatTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/HeatTile.jsx", error: String((e && e.message) || e) }); }

// components/data/MaskedCell.jsx
try { (() => {
/** The k-anonymity treatment (components/ui/Risk.tsx MaskedCell): a cell under threshold renders the threshold itself — "n<5" — never a number, a zero or a blank. */
function MaskedCell({
  threshold = 5,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    title: 'n < ' + threshold,
    style: {
      display: 'inline-flex',
      flex: 'none',
      alignItems: 'center',
      borderRadius: 999,
      border: '1px solid var(--op-orange)',
      background: 'transparent',
      padding: '3px 10px',
      fontSize: 11,
      fontWeight: 600,
      lineHeight: 1,
      color: 'var(--op-danger)',
      ...style
    }
  }, 'n<' + threshold);
}
Object.assign(__ds_scope, { MaskedCell });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/MaskedCell.jsx", error: String((e && e.message) || e) }); }

// components/data/Meter.jsx
try { (() => {
/** The thin progress/participation bar: a 6–7px pill track at 7–8% ink with a coloured fill. The respondent's progress uses 5px with the yellow accent. */
function Meter({
  pct = 0,
  height = 7,
  color = 'var(--op-greenbar)',
  track = 'rgba(25,21,16,.08)',
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      height,
      overflow: 'hidden',
      borderRadius: 999,
      background: track,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      height: '100%',
      borderRadius: 999,
      width: Math.max(0, Math.min(100, pct)) + '%',
      background: color
    }
  }));
}
/** rateColour (lib/participation/read.ts): the response-rate fill by level. */
function rateColour(pct) {
  return pct >= 70 ? '#5C9A55' : pct >= 50 ? '#E0A21F' : '#D4633A';
}
/** Capitalised alias, exposed on the window namespace. */
const RateColour = rateColour;
Object.assign(__ds_scope, { Meter, rateColour, RateColour });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Meter.jsx", error: String((e && e.message) || e) }); }

// components/data/RiskBadge.jsx
try { (() => {
/** Risk-band pill (components/ui/Risk.tsx). Bands are what app.risk_band() returns: Lav ≥65 · Middels 50–64 · Høy <50. */
const BAND_LABEL = {
  lav: 'Lav',
  middels: 'Middels',
  hoy: 'Høy'
};
const BAND_BAR = {
  lav: '#5C9A55',
  middels: '#E0A21F',
  hoy: '#D4633A'
};
const STYLE = {
  lav: {
    background: 'var(--op-mint)',
    color: 'var(--op-greendeep)'
  },
  middels: {
    background: 'var(--op-band)',
    color: 'var(--op-cautiondeep)'
  },
  hoy: {
    background: 'var(--op-peach2)',
    color: 'var(--op-dangerdeep)'
  }
};
function RiskBadge({
  band = 'lav',
  label,
  size = 'sm',
  style
}) {
  const sz = size === 'row' ? {
    padding: '5px 11px',
    fontSize: 11.5
  } : {
    padding: '3px 10px',
    fontSize: 11,
    lineHeight: 1
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      flex: 'none',
      alignItems: 'center',
      borderRadius: 999,
      fontWeight: 700,
      ...sz,
      ...STYLE[band],
      ...style
    }
  }, label || BAND_LABEL[band]);
}
Object.assign(__ds_scope, { BAND_LABEL, BAND_BAR, RiskBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/RiskBadge.jsx", error: String((e && e.message) || e) }); }

// components/data/StackedBar.jsx
try { (() => {
/** The stacked distribution bar (components/ui/Risk.tsx): flex, 3px gaps, 30px tall, radius 9, clipped. Segments are flex-weighted. */
function StackedBar({
  segments = [],
  height = 30,
  labels,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: style
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height,
      gap: 3,
      overflow: 'hidden',
      borderRadius: 9
    }
  }, segments.map((s, i) => /*#__PURE__*/React.createElement("span", {
    key: s.key || i,
    style: {
      flex: s.flex,
      background: s.background,
      display: 'block'
    }
  }))), labels ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 10,
      fontSize: 11.5,
      color: 'var(--op-mut)'
    }
  }, labels.map((l, i) => /*#__PURE__*/React.createElement("span", {
    key: i
  }, l))) : null);
}
Object.assign(__ds_scope, { StackedBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StackedBar.jsx", error: String((e && e.message) || e) }); }

// components/data/StatusPill.jsx
try { (() => {
/** State pill for a round or a measure. apen/neste → soft yellow with deep-caution ink; planlagt → 5% ink; done → mint; late → peach. */
const TONES = {
  apen: {
    background: 'var(--op-sbg)',
    color: 'var(--op-cautiondeep)'
  },
  neste: {
    background: 'var(--op-sbg)',
    color: 'var(--op-cautiondeep)'
  },
  planlagt: {
    background: 'rgba(25,21,16,.05)',
    color: 'var(--op-mut)'
  },
  done: {
    background: 'var(--op-mint)',
    color: 'var(--op-greendeep)'
  },
  late: {
    background: 'var(--op-peach2)',
    color: 'var(--op-dangerdeep)'
  },
  accent: {
    background: 'var(--op-ac)',
    color: 'var(--op-ink)'
  },
  factor: {
    background: 'var(--op-sbg)',
    color: 'var(--op-ink)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontSize: 11,
    padding: '3px 10px'
  }
};
function StatusPill({
  tone = 'planlagt',
  size = 'table',
  children,
  style
}) {
  const sz = size === 'card' ? {
    padding: '5px 12px'
  } : size === 'small' ? {
    padding: '2px 9px'
  } : {
    padding: '4px 11px'
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      borderRadius: 999,
      fontSize: 11.5,
      fontWeight: 700,
      whiteSpace: 'nowrap',
      ...sz,
      ...TONES[tone],
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { StatusPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StatusPill.jsx", error: String((e && e.message) || e) }); }

// components/data/TypePill.jsx
try { (() => {
/** Round kind pill (malinger/Kommende.tsx TypePill): Grunnlinje on the track tint, Puls on the pulse tint. 11px/700, 11×4. */
function TypePill({
  kind = 'grunnlinje',
  label
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      borderRadius: 999,
      padding: '4px 11px',
      fontSize: 11.5,
      fontWeight: 700,
      background: kind === 'puls' ? 'var(--op-pulse)' : 'var(--op-track)',
      color: 'var(--op-ink)'
    }
  }, label || (kind === 'puls' ? 'Puls' : 'Grunnlinje'));
}
Object.assign(__ds_scope, { TypePill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/TypePill.jsx", error: String((e && e.message) || e) }); }

// components/forms/ChoiceOption.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** The respondent's answer option (respond/ChoiceGroup.tsx): r14, 16px/14px, a 23px ring, 14.5px label; chosen → ink border, soft-yellow fill, ink disc with a yellow dot. */
function ChoiceOption({
  label,
  on = false,
  muted = false,
  onClick,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    role: "radio",
    "aria-checked": on,
    onClick: onClick,
    style: {
      display: 'flex',
      width: '100%',
      cursor: 'pointer',
      alignItems: 'center',
      gap: 13,
      borderRadius: 14,
      border: '1px solid ' + (on ? 'var(--op-ink)' : 'var(--op-line)'),
      background: on ? 'var(--op-sbg)' : 'var(--op-sf)',
      padding: '14px 16px',
      textAlign: 'left',
      color: 'var(--op-ink)',
      fontFamily: 'inherit',
      boxSizing: 'border-box'
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'flex',
      height: 23,
      width: 23,
      flex: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      border: '2px solid ' + (on ? 'var(--op-ink)' : 'var(--op-rule)'),
      background: on ? 'var(--op-ink)' : 'transparent',
      boxSizing: 'border-box'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      height: 8,
      width: 8,
      borderRadius: 999,
      background: on ? 'var(--op-sbg)' : 'transparent'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14.5,
      fontWeight: on ? 700 : 500,
      color: !on && muted ? 'var(--op-mut)' : 'var(--op-ink)'
    }
  }, label));
}
Object.assign(__ds_scope, { ChoiceOption });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/ChoiceOption.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
/** A labelled control: 12px muted label with 5px under it (panel), or 13px bold with 7px (sign-in). */
function Field({
  label,
  variant = 'panel',
  hint,
  trailing,
  style,
  children
}) {
  const bold = variant === 'signin';
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: bold ? 7 : 5,
      fontSize: bold ? 13 : 12,
      fontWeight: bold ? 700 : 400,
      color: bold ? 'var(--op-ink)' : 'var(--op-mut)'
    }
  }, /*#__PURE__*/React.createElement("span", null, label), trailing), children, hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 6,
      fontSize: 12,
      lineHeight: 1.5,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, hint) : null);
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Text field in the bundle's sizes. field 38/r10/13 · control 40/r10/13.5 · md 42/r11/14 600 · signin 48/r12/15 on bg (1.5px line) · site 52/r13/15 on bg. */
const FIELD_SIZE = {
  field: {
    h: 38,
    r: 10,
    fs: 13,
    px: 13,
    bg: 'var(--op-sf)',
    bw: 1
  },
  control: {
    h: 40,
    r: 10,
    fs: 13.5,
    px: 11,
    bg: 'var(--op-sf)',
    bw: 1
  },
  md: {
    h: 42,
    r: 11,
    fs: 14,
    px: 14,
    bg: 'var(--op-sf)',
    bw: 1,
    fw: 600
  },
  signin: {
    h: 48,
    r: 12,
    fs: 15,
    px: 15,
    bg: 'var(--op-bg)',
    bw: 1.5
  },
  site: {
    h: 52,
    r: 13,
    fs: 15,
    px: 16,
    bg: 'var(--op-bg)',
    bw: 1
  }
};
function fieldStyle(size, invalid) {
  const s = FIELD_SIZE[size] || FIELD_SIZE.control;
  return {
    boxSizing: 'border-box',
    height: s.h,
    width: '100%',
    borderRadius: s.r,
    border: s.bw + 'px solid ' + (invalid ? 'var(--op-danger)' : 'var(--op-line)'),
    background: s.bg,
    paddingInline: s.px,
    fontSize: s.fs,
    fontWeight: s.fw || 400,
    color: 'var(--op-ink)',
    outline: 'none',
    fontFamily: 'inherit',
    minWidth: 0
  };
}
function Input({
  size = 'control',
  invalid,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("input", _extends({
    style: {
      ...fieldStyle(size, invalid),
      ...style
    },
    "aria-invalid": invalid || undefined
  }, rest));
}
Object.assign(__ds_scope, { FIELD_SIZE, fieldStyle, Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Mark.jsx
try { (() => {
/** The check square (maleoppsett/controls.tsx Mark): r5, 2px ink border, ink fill with a cream ✓ when checked. 19px in CheckRow, 18px in CheckCard, 22px/r7 in Oversikt's todo. */
function Mark({
  checked = false,
  size = 19,
  radius
}) {
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'flex',
      flex: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius || (size >= 22 ? 7 : 5),
      border: '2px solid var(--op-ink)',
      fontSize: size >= 22 ? 12 : 11,
      fontWeight: 700,
      width: size,
      height: size,
      boxSizing: 'border-box',
      background: checked ? 'var(--op-ink)' : size >= 22 ? 'var(--op-sf)' : 'transparent',
      color: checked ? 'var(--op-bg)' : 'transparent',
      lineHeight: 1
    }
  }, "\u2713");
}
Object.assign(__ds_scope, { Mark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Mark.jsx", error: String((e && e.message) || e) }); }

// components/forms/CheckCard.jsx
try { (() => {
/** The department card (bundle 1549): r12, 15px/10px, an 18px Mark, name over headcount; checked → ink border on soft yellow. */
function CheckCard({
  name,
  value,
  label,
  note,
  checked = false,
  disabled,
  onChange
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      borderRadius: 12,
      border: '1px solid ' + (checked ? 'var(--op-ink)' : 'var(--op-line)'),
      background: checked ? 'var(--op-sbg)' : 'transparent',
      padding: '10px 15px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      position: 'relative',
      opacity: disabled ? 0.55 : 1
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    name: name,
    value: value,
    checked: checked,
    disabled: disabled,
    onChange: onChange || (() => {}),
    style: {
      position: 'absolute',
      width: 1,
      height: 1,
      overflow: 'hidden',
      opacity: 0,
      margin: 0
    }
  }), /*#__PURE__*/React.createElement(__ds_scope.Mark, {
    checked: checked,
    size: 18
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13.5,
      fontWeight: checked ? 700 : 500
    }
  }, label), note ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 11.5,
      color: 'var(--op-mut)'
    }
  }, note) : null));
}
Object.assign(__ds_scope, { CheckCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/CheckCard.jsx", error: String((e && e.message) || e) }); }

// components/forms/CheckRow.jsx
try { (() => {
/** The full-width checkbox row (bundle 1533): r12 on an ink hairline, a 19px Mark, label 14/600 and an optional 11.5 sub-line. */
function CheckRow({
  name,
  label,
  sub,
  checked = false,
  disabled,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      width: '100%',
      alignItems: 'center',
      gap: 12,
      borderRadius: 12,
      border: '1px solid var(--op-ink)',
      padding: '13px 15px',
      textAlign: 'left',
      cursor: disabled ? 'not-allowed' : 'pointer',
      position: 'relative',
      boxSizing: 'border-box',
      opacity: disabled ? 0.55 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    name: name,
    checked: checked,
    disabled: disabled,
    onChange: onChange || (() => {}),
    style: {
      position: 'absolute',
      width: 1,
      height: 1,
      overflow: 'hidden',
      opacity: 0,
      margin: 0
    }
  }), /*#__PURE__*/React.createElement(__ds_scope.Mark, {
    checked: checked,
    size: 19
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 14,
      fontWeight: 600
    }
  }, label), sub ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 2,
      fontSize: 11.5,
      color: 'var(--op-mut)'
    }
  }, sub) : null));
}
Object.assign(__ds_scope, { CheckRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/CheckRow.jsx", error: String((e && e.message) || e) }); }

// components/forms/RadioCard.jsx
try { (() => {
/** The design's radio card (maleoppsett/controls.tsx): a 17px ring with an 8px dot, a bold label and a note; selected → ink border on the soft yellow. */
function RadioCard({
  name,
  value,
  label,
  note,
  checked = false,
  disabled,
  labelSize = 14,
  noteSize = 12,
  padX = 15,
  padY = 14,
  radius = 13,
  onChange
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 11,
      textAlign: 'left',
      cursor: disabled ? 'not-allowed' : 'pointer',
      border: '1px solid ' + (checked ? 'var(--op-ink)' : 'var(--op-line)'),
      background: checked ? 'var(--op-sbg)' : 'transparent',
      padding: padY + 'px ' + padX + 'px',
      borderRadius: radius,
      position: 'relative',
      opacity: disabled ? 0.55 : 1
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: name,
    value: value,
    checked: checked,
    disabled: disabled,
    onChange: onChange || (() => {}),
    style: {
      position: 'absolute',
      width: 1,
      height: 1,
      overflow: 'hidden',
      opacity: 0,
      margin: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 2,
      display: 'flex',
      width: 17,
      height: 17,
      flex: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      border: '2px solid var(--op-ink)',
      boxSizing: 'border-box'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      width: 8,
      height: 8,
      borderRadius: 999,
      background: checked ? '#191510' : 'transparent'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontWeight: checked ? 700 : 500,
      fontSize: labelSize
    }
  }, label), note ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 3,
      lineHeight: 1.45,
      color: 'var(--op-mut)',
      fontSize: noteSize,
      textWrap: 'pretty'
    }
  }, note) : null));
}
Object.assign(__ds_scope, { RadioCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/RadioCard.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Native select in the field sizes; the header's role selector is the 34px 'role' variant (bg fill, 12.5/600). */
function Select({
  size = 'control',
  options = [],
  style,
  children,
  ...rest
}) {
  const base = size === 'role' ? {
    height: 34,
    cursor: 'pointer',
    borderRadius: 10,
    border: '1px solid var(--op-line)',
    background: 'var(--op-bg)',
    paddingInline: 11,
    fontSize: 12.5,
    fontWeight: 600,
    color: 'var(--op-ink)',
    fontFamily: 'inherit',
    outline: 'none'
  } : {
    ...__ds_scope.fieldStyle(size),
    cursor: 'pointer'
  };
  return /*#__PURE__*/React.createElement("select", _extends({
    style: {
      ...base,
      ...style
    }
  }, rest), options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value,
    disabled: o.disabled
  }, o.label)), children);
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Multi-line field. panel 74/r11 13.5 (handlingsplan) · comment 74/r12 13.5 on the surface · open 130/r14 14 (respondent free text) · greeting 96/r12 on bg. */
function Textarea({
  size = 'panel',
  minHeight,
  style,
  ...rest
}) {
  const S = {
    panel: {
      r: 11,
      fs: 13.5,
      mh: 74,
      px: 14,
      py: 11,
      bg: 'var(--op-sf)'
    },
    comment: {
      r: 12,
      fs: 13.5,
      mh: 74,
      px: 14,
      py: 12,
      bg: 'var(--op-sf)'
    },
    open: {
      r: 14,
      fs: 14,
      mh: 130,
      px: 15,
      py: 13,
      bg: 'var(--op-sf)'
    },
    greeting: {
      r: 12,
      fs: 13.5,
      mh: 96,
      px: 14,
      py: 12,
      bg: 'var(--op-bg)'
    }
  };
  const s = S[size] || S.panel;
  return /*#__PURE__*/React.createElement("textarea", _extends({
    style: {
      boxSizing: 'border-box',
      minHeight: minHeight || s.mh,
      width: '100%',
      resize: 'vertical',
      borderRadius: s.r,
      border: '1px solid var(--op-line)',
      background: s.bg,
      padding: s.py + 'px ' + s.px + 'px',
      fontSize: s.fs,
      lineHeight: 1.55,
      color: 'var(--op-ink)',
      outline: 'none',
      fontFamily: 'inherit',
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** The panel card (components/ui/Card.tsx): padding 26px, radius 20px, 1px #E8DFC9 hairline on #FFFDF6. The container almost every screen is built from. */
function Card({
  as = 'div',
  tone = 'surface',
  style,
  children,
  ...rest
}) {
  const Tag = as;
  const fills = {
    surface: {
      background: 'var(--op-sf)',
      borderColor: 'var(--op-line)'
    },
    accent: {
      background: 'var(--op-sbg)',
      borderColor: 'var(--op-line)'
    },
    mint: {
      background: 'var(--op-mint)',
      borderColor: 'var(--op-line)'
    },
    ink: {
      background: 'var(--op-ink)',
      borderColor: 'var(--op-ink)',
      color: 'var(--op-bg)'
    },
    inset: {
      background: 'var(--op-bg)',
      borderColor: 'var(--op-line)'
    }
  };
  return /*#__PURE__*/React.createElement(Tag, _extends({
    style: {
      borderRadius: 20,
      border: '1px solid',
      padding: 26,
      boxSizing: 'border-box',
      ...fills[tone],
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Card.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Modal.jsx
try { (() => {
/** The design's modal (admin/Modal.tsx): dimmed page, 560px panel at radius 22 with a display-face title, a lead and a round close button. */
function Modal({
  open = true,
  onClose,
  title,
  sub,
  closeLabel = 'Lukk',
  width = 560,
  inline = false,
  children
}) {
  if (!open) return null;
  const panel = /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    "aria-label": typeof title === 'string' ? title : undefined,
    style: {
      maxHeight: inline ? undefined : '88vh',
      width: '100%',
      maxWidth: width,
      overflowY: 'auto',
      borderRadius: 22,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: 26,
      boxShadow: '0 34px 80px rgba(25,21,16,0.3)',
      boxSizing: 'border-box',
      animation: 'ht-in .25s ease'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 25,
      fontWeight: 500,
      lineHeight: 1.15,
      textWrap: 'balance'
    }
  }, title), sub ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 0',
      fontSize: 13,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, sub) : null), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    "aria-label": closeLabel,
    title: closeLabel,
    style: {
      display: 'flex',
      height: 36,
      width: 36,
      flex: 'none',
      cursor: 'pointer',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      border: '1px solid var(--op-line)',
      background: 'transparent',
      fontSize: 18,
      color: 'var(--op-ink)',
      padding: 0,
      lineHeight: 1
    }
  }, "\xD7")), children);
  if (inline) return panel;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 80,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(25,21,16,.42)',
      padding: 24
    },
    onMouseDown: e => e.target === e.currentTarget && onClose && onClose()
  }, panel);
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Modal.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/NoteCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** The assistant note (components/ui/Card.tsx NoteCard): radius 16, padding 16px 18px, on the soft yellow — the design marks it as Tuva speaking. */
function NoteCard({
  face,
  style,
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      borderRadius: 16,
      background: 'var(--op-sbg)',
      padding: '16px 18px',
      display: face ? 'flex' : 'block',
      gap: 13,
      alignItems: 'flex-start',
      ...style
    }
  }, rest), face ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'block',
      flex: 'none',
      width: 38,
      height: 38,
      borderRadius: 11,
      background: 'var(--op-sf) url(' + face + ') center/cover no-repeat'
    }
  }) : null, face ? /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, children) : children);
}
Object.assign(__ds_scope, { NoteCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/NoteCard.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Row.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** A worklist row (components/ui/Card.tsx Row): radius 15, padding 15px 18px, hairline on the card surface, a 7px tone stripe down the left edge. */
function Row({
  tone,
  title,
  meta,
  action,
  style,
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      borderRadius: 15,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: '15px 18px',
      ...style
    }
  }, rest), tone ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'block',
      minHeight: 38,
      width: 7,
      flex: 'none',
      alignSelf: 'stretch',
      borderRadius: 999,
      background: tone
    }
  }) : null, title !== undefined ? /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 14.5,
      fontWeight: 600,
      textWrap: 'pretty'
    }
  }, title), meta ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 2,
      fontSize: 12.5,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, meta) : null) : children, action);
}
Object.assign(__ds_scope, { Row });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Row.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Section.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** One numbered card of a setup (maleoppsett/controls.tsx Section) and the Oversikt panel: 22px 24px, radius 18, hairline. */
function Section({
  head,
  aside,
  title,
  style,
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("section", _extends({
    style: {
      borderRadius: 18,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: '22px 24px',
      boxSizing: 'border-box',
      ...style
    }
  }, rest), head || aside || title ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 12
    }
  }, title ? /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 21,
      fontWeight: 600
    }
  }, title) : /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.11em',
      color: 'var(--op-mut)'
    }
  }, head), aside) : null, children);
}
Object.assign(__ds_scope, { Section });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Section.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Home.jsx
try { (() => {
// Innsikt (Full view home) and Oversikt (Enkel view home) — transcribed from components/innsikt/InnsiktScreen.tsx and components/oversikt/*.
const DS = window.OrgpulsDesignSystem_d91c81;
const {
  Card,
  Section,
  Row,
  Button,
  Eyebrow,
  StackedBar,
  HeatTile,
  HeatTone: heatTone,
  Meter,
  Mark,
  Input,
  Tick
} = DS;
const D = window.OP_DATA;
const fmt = d => (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d);
const page = {
  margin: '0 auto',
  maxWidth: 'var(--page-w, 1180px)',
  padding: '30px 28px 60px'
};
const DISC = {
  done: {
    background: '#CFE7E4',
    borderColor: '#2F5D2A',
    color: '#20431C'
  },
  current: {
    background: '#F5C64A',
    borderColor: '#191510',
    color: '#191510'
  },
  pending: {
    background: 'transparent',
    borderColor: '#C4BCA8',
    color: '#5F5849'
  }
};
const DOT = {
  done: {
    background: '#2F5D2A',
    borderColor: '#2F5D2A',
    size: 15
  },
  current: {
    background: '#F5C64A',
    borderColor: '#191510',
    size: 21
  },
  pending: {
    background: '#FCF6E9',
    borderColor: '#C4BCA8',
    size: 15
  }
};
const LOOP = [{
  label: 'Kartlagt',
  mark: '✓',
  state: 'done',
  when: 'lukket 14. feb'
}, {
  label: 'Risikovurdert',
  mark: '✓',
  state: 'done',
  when: '2 av 2 ferdig'
}, {
  label: 'Tiltak løper',
  mark: '3',
  state: 'current',
  when: '1 over frist',
  alert: true
}, {
  label: 'Effekt målt',
  mark: '',
  state: 'pending',
  when: 'virket tiltakene?'
}];
const YEAR = [{
  month: 'FEB',
  label: 'Grunnlinje',
  sub: 'lukket',
  state: 'done'
}, {
  month: 'MAI',
  label: 'Puls 1',
  sub: '82 % svarte',
  state: 'done'
}, {
  month: 'AUG',
  label: 'Puls 2',
  sub: 'NÅ',
  state: 'current'
}, {
  month: 'NOV',
  label: 'Puls 3',
  sub: '3 spørsmål',
  state: 'pending'
}, {
  month: 'JAN',
  label: 'Rapport',
  sub: 'til AMU',
  state: 'pending'
}];
const TODO = [{
  tone: '#D4633A',
  title: 'Oppdater tiltaket «Svar på hver melding innen fem dager»',
  meta: 'Ansvarlig Kari Nordmann · frist gikk ut · knyttet til Ytringsklima',
  cta: 'Oppdater',
  primary: true,
  go: 'tiltak'
}, {
  tone: '#E0A21F',
  title: 'Godkjenn pulsen som går ut 4. juni',
  meta: '6 spørsmål · Ytringsklima og Arbeidsmengde',
  cta: 'Se utvalget',
  primary: false,
  go: 'malinger'
}, {
  tone: '#5C9A55',
  title: 'Oppdater tiltaket «Workshop: Hva hindrer oss i å si fra?»',
  meta: 'Ansvarlig Ola Hansen · frist 30. juni · knyttet til Ytringsklima',
  cta: 'Oppdater',
  primary: false,
  go: 'tiltak'
}];
function Innsikt({
  go
}) {
  const I = D.index;
  return /*#__PURE__*/React.createElement("main", {
    className: "animate-entry",
    style: page
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, D.org.name, " \xB7 ", D.org.employees, " ansatte"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '6px 0 0',
      fontFamily: 'var(--font-display)',
      fontSize: 34,
      fontWeight: 600,
      lineHeight: 1.1
    }
  }, "Dere er i rute"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '9px 0 0',
      maxWidth: 520,
      fontSize: 14.5,
      lineHeight: 1.6,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, "Grunnlinjen er tatt og risikovurdert. Tre tiltak l\xF8per. Neste puls m\xE5ler om de virket.")), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    onClick: () => go('resultater')
  }, "Se hele resultatet")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24,
      display: 'grid',
      alignItems: 'start',
      gap: 18,
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    as: "section"
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Arbeidsmilj\xF8indeks"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 62,
      fontWeight: 600,
      lineHeight: 0.85,
      fontVariantNumeric: 'tabular-nums'
    }
  }, I.value), /*#__PURE__*/React.createElement("span", {
    style: {
      paddingBottom: 9
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--op-danger)'
    }
  }, fmt(I.delta), " siden i fjor"))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(StackedBar, {
    segments: [{
      key: 'lav',
      flex: I.bands.lav,
      background: '#CFE7E4'
    }, {
      key: 'mid',
      flex: I.bands.middels,
      background: '#F5DC96'
    }, {
      key: 'hoy',
      flex: I.bands.hoy,
      background: '#F0B9A0'
    }],
    labels: [I.bands.lav + ' forsvarlig', I.bands.middels + ' følges opp', I.bands.hoy + ' høy risiko']
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24,
      borderTop: '1px solid var(--op-line)',
      paddingTop: 20
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Sl\xF8yfen \u2014 der loven vil dere skal v\xE6re"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: 'flex',
      alignItems: 'flex-start'
    }
  }, LOOP.map(s => /*#__PURE__*/React.createElement("span", {
    key: s.label,
    style: {
      minWidth: 0,
      flex: 1,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      margin: '0 auto',
      display: 'flex',
      height: 32,
      width: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      border: '2px solid',
      fontSize: 13,
      fontWeight: 700,
      boxSizing: 'border-box',
      ...DISC[s.state]
    }
  }, s.mark), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 8,
      display: 'block',
      fontSize: 11.5,
      fontWeight: 600,
      lineHeight: 1.3
    }
  }, s.label), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 2,
      display: 'block',
      fontSize: 10.5,
      color: s.alert ? 'var(--op-danger)' : 'var(--op-mut)'
    }
  }, s.when)))))), /*#__PURE__*/React.createElement(Card, {
    as: "section"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#malinger",
    onClick: e => {
      e.preventDefault();
      go('malinger');
    },
    style: {
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.11em',
      color: 'var(--op-mut)',
      textDecoration: 'underline'
    }
  }, "Arbeidsmilj\xF8\xE5ret \u2014 sett opp automatikk"), /*#__PURE__*/React.createElement("a", {
    href: "#rapport",
    onClick: e => e.preventDefault(),
    style: {
      flex: 'none',
      borderRadius: 12,
      border: '1px solid #2F5D2A',
      background: '#CFE7E4',
      color: '#20431C',
      padding: '8px 13px',
      textAlign: 'left',
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 10.5,
      fontWeight: 600
    }
  }, "Kartlegging og risikovurdering"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 1,
      display: 'block',
      fontSize: 13,
      fontWeight: 700
    }
  }, "Dokumentert \u2014 \xE5pne rapporten \u2192"))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 0 2px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 6,
      textAlign: 'center',
      fontSize: 10.5,
      fontWeight: 700,
      gridTemplateColumns: 'repeat(5, 1fr)'
    }
  }, YEAR.map(p => /*#__PURE__*/React.createElement("span", {
    key: p.month,
    style: {
      color: p.state === 'current' ? 'var(--op-ink)' : 'var(--op-mut)'
    }
  }, p.month))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      marginTop: 8,
      height: 26
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: '50%',
      display: 'block',
      height: 3,
      transform: 'translateY(-50%)',
      borderRadius: 999,
      background: 'var(--op-line)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 0,
      top: '50%',
      display: 'block',
      height: 3,
      transform: 'translateY(-50%)',
      borderRadius: 999,
      background: 'var(--op-link)',
      width: '50%'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'grid',
      height: '100%',
      placeItems: 'center',
      gap: 6,
      gridTemplateColumns: 'repeat(5, 1fr)'
    }
  }, YEAR.map(p => /*#__PURE__*/React.createElement("span", {
    key: p.month,
    style: {
      display: 'block',
      borderRadius: 999,
      border: '2px solid',
      width: DOT[p.state].size,
      height: DOT[p.state].size,
      background: DOT[p.state].background,
      borderColor: DOT[p.state].borderColor,
      boxSizing: 'border-box'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 9,
      display: 'grid',
      gap: 6,
      textAlign: 'center',
      fontSize: 11.5,
      lineHeight: 1.3,
      gridTemplateColumns: 'repeat(5, 1fr)'
    }
  }, YEAR.map(p => /*#__PURE__*/React.createElement("span", {
    key: p.month
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontWeight: p.state === 'current' ? 700 : 600
    }
  }, p.label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      color: 'var(--op-mut)'
    }
  }, p.sub))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 26
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 22,
      fontWeight: 600
    }
  }, "Venter p\xE5 deg"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--op-mut)'
    }
  }, "Hele virksomheten")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, TODO.map(t => /*#__PURE__*/React.createElement(Row, {
    key: t.title,
    tone: t.tone,
    title: t.title,
    meta: t.meta,
    action: /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      tone: t.primary ? 'primary' : 'quiet',
      pad: 16,
      style: t.primary ? undefined : {
        background: 'transparent'
      },
      onClick: () => go(t.go)
    }, t.cta)
  })))));
}
function FactorRow({
  f,
  onOpen
}) {
  const tone = heatTone(f.index);
  const word = f.index < 50 ? 'Trenger innsats' : f.index < 66 ? 'Følg med' : 'Bra';
  const dc = f.delta <= -3 ? 'var(--op-danger)' : f.delta >= 3 ? 'var(--op-link)' : 'var(--op-faint)';
  return /*#__PURE__*/React.createElement("a", {
    href: "#resultater",
    onClick: e => {
      e.preventDefault();
      onOpen();
    },
    style: {
      display: 'grid',
      cursor: 'pointer',
      alignItems: 'center',
      gap: 10,
      borderBottom: '1px solid var(--op-track)',
      padding: '8px 4px',
      textAlign: 'left',
      color: 'var(--op-ink)',
      textDecoration: 'none',
      gridTemplateColumns: 'minmax(0,1fr) 36px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 8,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600
    }
  }, f.name), /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: 'nowrap',
      fontSize: 11.5,
      color: 'var(--op-mut)'
    }
  }, word, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      color: dc
    }
  }, fmt(f.delta)))), /*#__PURE__*/React.createElement(Meter, {
    pct: f.index,
    height: 7,
    color: tone.bg,
    track: "rgba(25,21,16,.07)",
    style: {
      marginTop: 6
    }
  })), /*#__PURE__*/React.createElement(HeatTile, {
    index: f.index
  }));
}
function TodoList() {
  const [done, setDone] = React.useState({});
  const items = D.measures.filter(m => m.step === 1 || m.step === 2).slice(0, 3);
  return items.map(m => {
    const ok = !!done[m.id];
    return /*#__PURE__*/React.createElement("button", {
      key: m.id,
      type: "button",
      role: "checkbox",
      "aria-checked": ok,
      "aria-label": 'Merk «' + m.title + '» som gjennomført',
      onClick: () => setDone({
        ...done,
        [m.id]: !ok
      }),
      style: {
        display: 'flex',
        width: '100%',
        cursor: 'pointer',
        alignItems: 'center',
        gap: 14,
        borderRadius: 13,
        border: '1px solid var(--op-line)',
        background: 'var(--op-bg)',
        padding: '13px 15px',
        textAlign: 'left',
        color: 'var(--op-ink)',
        fontFamily: 'inherit',
        opacity: ok ? 0.55 : 1
      }
    }, /*#__PURE__*/React.createElement(Mark, {
      checked: ok,
      size: 22
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        minWidth: 0,
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        fontSize: 14.5,
        fontWeight: 600,
        textDecoration: ok ? 'line-through' : 'none'
      }
    }, m.title), /*#__PURE__*/React.createElement("span", {
      style: {
        marginTop: 2,
        display: 'block',
        fontSize: 12.5,
        color: m.late && !ok ? 'var(--op-danger)' : 'var(--op-mut)'
      }
    }, m.owner, " \xB7 ", m.due.replace('Frist', 'frist'))));
  });
}
function WaitingList() {
  const [drafts, setDrafts] = React.useState({});
  const [sent, setSent] = React.useState({});
  const items = D.comments.filter(c => c.needsReply && !sent[c.id]).sort((a, b) => b.waitingDays - a.waitingDays).slice(0, 2);
  if (!items.length) return /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 12,
      background: 'var(--op-mint)',
      padding: 16,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--op-greendeep)'
    }
  }, "Alle kommentarer er besvart.");
  const name = k => D.factors.find(f => f.key === k).name;
  return items.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    style: {
      borderRadius: 13,
      border: '1px solid var(--op-line)',
      background: 'var(--op-bg)',
      padding: '14px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      borderRadius: 999,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: '2px 9px',
      fontSize: 11,
      fontWeight: 700
    }
  }, name(c.factor)), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontSize: 11.5,
      fontWeight: 600,
      color: c.waitingDays >= 5 ? 'var(--op-danger)' : 'var(--op-mut)'
    }
  }, "Venter \xB7 ", c.waitingDays, " dager")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 1.55,
      textWrap: 'pretty'
    }
  }, "\xAB", c.text, "\xBB"), /*#__PURE__*/React.createElement("form", {
    style: {
      marginTop: 10,
      display: 'flex',
      gap: 8
    },
    onSubmit: e => {
      e.preventDefault();
      if ((drafts[c.id] || '').trim()) setSent({
        ...sent,
        [c.id]: true
      });
    }
  }, /*#__PURE__*/React.createElement(Input, {
    size: "field",
    value: drafts[c.id] || '',
    onChange: e => setDrafts({
      ...drafts,
      [c.id]: e.target.value
    }),
    placeholder: "Svar anonymt \u2026",
    "aria-label": "Ditt svar p\xE5 kommentaren",
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    style: {
      height: 38,
      flex: 'none',
      cursor: 'pointer',
      borderRadius: 10,
      border: '1px solid var(--op-ink)',
      background: 'var(--op-ac)',
      padding: '0 16px',
      fontSize: 12.5,
      fontWeight: 700,
      color: 'var(--op-ink)',
      fontFamily: 'inherit'
    }
  }, "Send"))));
}
function Oversikt({
  go
}) {
  const I = D.index;
  const byIndex = [...D.factors].sort((a, b) => a.index - b.index);
  const link = {
    cursor: 'pointer',
    fontWeight: 700,
    color: 'var(--op-link)',
    textDecoration: 'none'
  };
  const waiting = D.comments.filter(c => c.needsReply).length;
  return /*#__PURE__*/React.createElement("main", {
    className: "animate-entry",
    style: {
      margin: '0 auto',
      maxWidth: 'var(--overview-w, 880px)',
      padding: '34px 28px 60px'
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, D.org.name, " \xB7 arbeidsmilj\xF8et"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '10px 0 0',
      fontFamily: 'var(--font-display)',
      fontSize: 30,
      fontWeight: 500,
      lineHeight: 1.3,
      textWrap: 'pretty'
    }
  }, "Folk trives med mening og anerkjennelse. Det som trekker ned, er ytringsklima og arbeidsmengde."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '10px 22px',
      fontSize: 13.5,
      color: 'var(--op-mut)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "Indeks ", /*#__PURE__*/React.createElement("strong", {
    style: {
      fontSize: 18,
      color: 'var(--op-ink)'
    }
  }, I.value)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      color: 'var(--op-danger)'
    }
  }, Math.abs(I.delta), " poeng lavere enn i fjor"), /*#__PURE__*/React.createElement("span", null, I.answered, " av ", I.headcount, " svarte"), /*#__PURE__*/React.createElement("a", {
    href: "#resultater",
    style: {
      ...link,
      marginLeft: 'auto',
      fontSize: 13
    },
    onClick: e => {
      e.preventDefault();
      go('resultater');
    }
  }, "Se alle tall \u2192"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      ...link,
      fontSize: 13
    },
    onClick: e => e.preventDefault()
  }, "Veiviser")), /*#__PURE__*/React.createElement(Section, {
    title: "Slik st\xE5r det til p\xE5 hvert omr\xE5de",
    aside: /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        color: 'var(--op-mut)'
      }
    }, "Skala 0\u2013100. Under 50 b\xF8r dere gj\xF8re noe med. Trykk p\xE5 et omr\xE5de for tallene bak."),
    style: {
      marginTop: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: 'grid',
      gap: '8px 18px',
      gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))'
    }
  }, byIndex.map(f => /*#__PURE__*/React.createElement(FactorRow, {
    key: f.key,
    f: f,
    onOpen: () => go('resultater')
  })))), /*#__PURE__*/React.createElement(Section, {
    title: "Gj\xF8r dette n\xE5",
    aside: /*#__PURE__*/React.createElement("a", {
      href: "#tiltak",
      style: {
        ...link,
        fontSize: 12.5
      },
      onClick: e => {
        e.preventDefault();
        go('tiltak');
      }
    }, "Alle tiltak \u2192"),
    style: {
      marginTop: 26
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(TodoList, null))), /*#__PURE__*/React.createElement(Section, {
    title: "Venter p\xE5 svar fra deg",
    aside: /*#__PURE__*/React.createElement("a", {
      href: "#kommentarer",
      style: {
        ...link,
        fontSize: 12.5
      },
      onClick: e => {
        e.preventDefault();
        go('kommentarer');
      }
    }, "Alle ", waiting, " \u2192"),
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 3,
      fontSize: 12.5,
      color: 'var(--op-mut)'
    }
  }, "Du svarer uten \xE5 vite hvem som skrev."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(WaitingList, null))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: 'grid',
      alignItems: 'stretch',
      gap: 14,
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))'
    }
  }, /*#__PURE__*/React.createElement(Section, {
    head: "Kommende m\xE5linger",
    aside: /*#__PURE__*/React.createElement("a", {
      href: "#malinger",
      style: {
        ...link,
        fontSize: 12
      },
      onClick: e => {
        e.preventDefault();
        go('malinger');
      }
    }, "Endre \u2192"),
    style: {
      padding: '20px 22px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 9
    }
  }, D.rounds.map(r => /*#__PURE__*/React.createElement("div", {
    key: r.id,
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 11
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      marginTop: 4,
      boxSizing: 'border-box',
      height: 12,
      width: 12,
      flex: 'none',
      borderRadius: 999,
      border: '2px solid ' + (r.kind === 'puls' ? 'var(--op-link)' : 'var(--op-ink)'),
      background: r.kind === 'puls' ? 'var(--op-teal)' : 'var(--op-ac)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13.5
    }
  }, /*#__PURE__*/React.createElement("strong", null, r.kind === 'puls' ? 'Kort oppfølging' : 'Hovedundersøkelse'), " \xB7 ", r.date), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 1,
      display: 'block',
      fontSize: 12,
      lineHeight: 1.45,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, r.kind === 'puls' ? '6 spørsmål om ytringsklima og arbeidsmengde.' : 'Alle spørsmål, alle ansatte. Setter årets nullpunkt.'))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      fontSize: 11.5,
      lineHeight: 1.45,
      color: 'var(--op-mut)'
    }
  }, "G\xE5r ut av seg selv. Verneombudet f\xE5r beskjed 2 dager f\xF8r de ansatte.")), /*#__PURE__*/React.createElement("a", {
    href: "#rapport",
    onClick: e => e.preventDefault(),
    style: {
      display: 'flex',
      cursor: 'pointer',
      flexDirection: 'column',
      justifyContent: 'center',
      borderRadius: 18,
      border: '1px solid var(--op-ink)',
      background: 'var(--op-sbg)',
      padding: '20px 22px',
      textAlign: 'left',
      color: 'var(--op-ink)',
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Til personalm\xF8tet eller styret"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 8,
      display: 'block',
      fontSize: 17,
      fontWeight: 700
    }
  }, "Lag rapport \u2192"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 4,
      display: 'block',
      fontSize: 12.5,
      lineHeight: 1.5,
      color: 'var(--op-body)',
      textWrap: 'pretty'
    }
  }, "Funn, vurdering og tiltak. Du leser gjennom og godkjenner."))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      borderRadius: 14,
      background: 'var(--op-mint)',
      padding: '14px 18px',
      color: 'var(--op-greendeep)'
    }
  }, /*#__PURE__*/React.createElement(Tick, {
    size: 26,
    round: true,
    inverted: true
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      lineHeight: 1.5,
      textWrap: 'pretty'
    }
  }, "Kartleggingen for 2026 er gjort og risikovurdert. Dokumentasjonen er klar hvis Arbeidstilsynet sp\xF8r.")));
}
Object.assign(window, {
  Innsikt,
  Oversikt
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Home.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Measure.jsx
try { (() => {
// Målinger › Kommende (components/malinger/Kommende.tsx) and Resultater › Varmekart (components/resultater/*, the product shot).
const DS = window.OrgpulsDesignSystem_d91c81;
const {
  Card,
  Section,
  Button,
  Eyebrow,
  Pill,
  TypePill,
  StatusPill,
  Meter,
  RateColour: rateColour,
  HeatTile,
  HeatTone: heatTone
} = DS;
const D = window.OP_DATA;
const page = {
  margin: '0 auto',
  maxWidth: 'var(--page-w, 1180px)',
  padding: '30px 28px 60px'
};
const COLS = 'minmax(0,2fr) 110px minmax(0,1.3fr) 110px 250px';
function Tabs({
  tabs,
  value,
  onChange,
  counts
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      marginTop: 22,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      borderBottom: '1px solid var(--op-line)'
    }
  }, tabs.map(t => {
    const on = value === t;
    return /*#__PURE__*/React.createElement("a", {
      key: t,
      href: "#",
      "aria-current": on ? 'page' : undefined,
      onClick: e => {
        e.preventDefault();
        onChange(t);
      },
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: '3px solid ' + (on ? 'var(--op-ink)' : 'transparent'),
        padding: '10px 16px 12px',
        fontSize: 14.5,
        textDecoration: 'none',
        fontWeight: on ? 700 : 500,
        color: on ? 'var(--op-ink)' : 'var(--op-mut)'
      }
    }, t, counts && counts[t] !== undefined ? /*#__PURE__*/React.createElement("span", {
      style: {
        borderRadius: 999,
        background: 'var(--op-track)',
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--op-mut)'
      }
    }, counts[t]) : null);
  }));
}
function Malinger({
  go
}) {
  const [tab, setTab] = React.useState('Kommende');
  const L = D.latest;
  const ghost = {
    display: 'inline-flex',
    height: 34,
    alignItems: 'center',
    whiteSpace: 'nowrap',
    borderRadius: 10,
    border: '1px solid var(--op-line)',
    background: 'transparent',
    padding: '0 13px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--op-ink)',
    textDecoration: 'none'
  };
  return /*#__PURE__*/React.createElement("main", {
    className: "animate-entry",
    style: page
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 32,
      fontWeight: 600,
      lineHeight: 1.1
    }
  }, "M\xE5linger"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '9px 0 0',
      maxWidth: 560,
      fontSize: 14.5,
      lineHeight: 1.6,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, "\xC9n grunnlinje i \xE5ret dekker kartleggingsplikten. Pulsene mellom m\xE5ler bare det dere har satt tiltak p\xE5 \u2014 tre sp\xF8rsm\xE5l per tema, rundt ett minutt.")), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "md",
    tone: "secondary"
  }, "Forh\xE5ndsvis som ansatt"), /*#__PURE__*/React.createElement(Button, {
    size: "md"
  }, "\uFF0B Ny m\xE5ling"))), /*#__PURE__*/React.createElement(Tabs, {
    tabs: ['Kommende', 'Historikk', 'Årshjul', 'Spørsmålssett', 'Innstillinger'],
    value: tab,
    onChange: setTab
  }), tab !== 'Kommende' ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      borderRadius: 18,
      border: '1px dashed var(--op-rule)',
      background: 'var(--op-sf)',
      padding: '34px 26px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600
    }
  }, tab, " er ikke gjenskapt i UI-kitet"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 5,
      fontSize: 13,
      color: 'var(--op-mut)'
    }
  }, "Se components/malinger/", tab === 'Historikk' ? 'Historikk' : tab === 'Årshjul' ? 'YearRail' : tab === 'Spørsmålssett' ? 'Sporsmalssettet' : 'Innstillinger', ".tsx i kildekoden.")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      overflowX: 'auto',
      borderRadius: 16,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 760
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: COLS,
      gap: 16,
      borderBottom: '1px solid var(--op-line)',
      padding: '12px 20px',
      fontSize: 10.5,
      textTransform: 'uppercase',
      letterSpacing: '.09em',
      color: 'var(--op-mut)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "M\xE5ling \xB7 ", D.rounds.length, " m\xE5linger"), /*#__PURE__*/React.createElement("span", null, "Type"), /*#__PURE__*/React.createElement("span", null, "Svar"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Status"), /*#__PURE__*/React.createElement("span", null)), D.rounds.map((r, i) => {
    const first = r.state === 'neste';
    return /*#__PURE__*/React.createElement("div", {
      key: r.id,
      style: {
        display: 'grid',
        gridTemplateColumns: COLS,
        alignItems: 'center',
        gap: 16,
        borderBottom: i === D.rounds.length - 1 ? 'none' : '1px solid var(--op-track)',
        padding: '14px 20px'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        fontSize: 15,
        fontWeight: 600
      }
    }, r.title), /*#__PURE__*/React.createElement("span", {
      style: {
        marginTop: 2,
        display: 'block',
        fontSize: 12,
        color: 'var(--op-mut)'
      }
    }, r.meta)), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(TypePill, {
      kind: r.kind
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        fontSize: 12,
        color: 'var(--op-mut)'
      }
    }, r.answered !== null ? r.answered + ' av ' + D.org.employees + ' svarte' : 'Ikke sendt'), /*#__PURE__*/React.createElement("span", {
      style: {
        marginTop: 5,
        display: 'flex',
        alignItems: 'center',
        gap: 9
      }
    }, /*#__PURE__*/React.createElement(Meter, {
      pct: r.pct || 0,
      height: 6,
      color: "var(--op-greenbar)",
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 'none',
        fontSize: 12.5,
        fontWeight: 700
      }
    }, r.pct !== null ? r.pct + ' %' : '—'))), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        justifyContent: 'flex-end'
      }
    }, /*#__PURE__*/React.createElement(StatusPill, {
      tone: r.state
    }, r.state === 'neste' ? 'Neste' : r.state === 'apen' ? 'Pågår' : 'Planlagt')), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("a", {
      href: "#",
      style: ghost,
      onClick: e => e.preventDefault()
    }, "Vis i \xE5rshjulet"), /*#__PURE__*/React.createElement("a", {
      href: "#",
      onClick: e => e.preventDefault(),
      style: {
        ...ghost,
        border: '1px solid var(--op-ink)',
        padding: '0 14px',
        fontWeight: 700,
        background: first ? 'var(--op-ac)' : 'transparent'
      }
    }, first && r.kind === 'puls' ? 'Definer pulsen' : 'Se oppsett')));
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--op-mut)'
    }
  }, "Siste gjennomf\xF8rte: ", L.title, ", lukket ", L.closed, " \u2014 ", L.answered, " av ", L.headcount, " svarte."), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      setTab('Historikk');
    },
    style: {
      fontSize: 13,
      fontWeight: 700
    }
  }, "Se historikk \u2192")), /*#__PURE__*/React.createElement(Section, {
    style: {
      marginTop: 20,
      padding: '24px 26px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 21,
      fontWeight: 600
    }
  }, "Deltakelse"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 4,
      display: 'block',
      fontSize: 13,
      color: 'var(--op-mut)'
    }
  }, L.title, " \u2014 lukket \xB7 Lukket ", L.closed, " \xB7 ingen flere svar kommer inn")), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 'none',
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-display)',
      fontSize: 32,
      fontWeight: 600,
      lineHeight: 1
    }
  }, L.pct, " %"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 2,
      display: 'block',
      fontSize: 12,
      color: 'var(--op-mut)'
    }
  }, L.answered, " av ", L.headcount, " har svart"))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18,
      display: 'grid',
      gap: 12,
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))'
    }
  }, D.participation.map(g => /*#__PURE__*/React.createElement("div", {
    key: g.name,
    style: {
      borderRadius: 13,
      border: '1px solid var(--op-line)',
      background: 'var(--op-bg)',
      padding: '14px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13.5,
      fontWeight: 600
    }
  }, g.name), g.pct !== null ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700
    }
  }, g.pct, " %") : null), g.pct !== null ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Meter, {
    pct: g.pct,
    height: 7,
    color: rateColour(g.pct),
    style: {
      marginTop: 9
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 11.5,
      color: 'var(--op-mut)'
    }
  }, g.answered, " av ", g.total)) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 11.5,
      color: 'var(--op-mut)'
    }
  }, g.total, " ansatte"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 11,
      lineHeight: 1.4,
      color: 'var(--op-caution)',
      textWrap: 'pretty'
    }
  }, "f\xE6rre enn ", D.org.threshold, " ansatte \u2014 deltakelsen vises ikke, og resultatene bare som del av helheten"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 18,
      borderTop: '1px solid var(--op-line)',
      paddingTop: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 'min(280px, 100%)',
      maxWidth: 600,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 12.5,
      lineHeight: 1.55,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, "Systemet vet hvem som ikke har svart, slik at p\xE5minnelsen bare g\xE5r dit. Ingen i virksomheten kan se den lista \u2014 verken du, lederne eller verneombudet. Koblingen mellom person og svar finnes ikke i databasen."), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 8,
      display: 'block',
      fontSize: 12.5,
      lineHeight: 1.5,
      color: 'var(--op-mut)'
    }
  }, "P\xE5minnelser kan bare sendes mens en runde er \xE5pen.")), /*#__PURE__*/React.createElement(Button, {
    size: "panel"
  }, "Start neste puls n\xE5")))));
}
function Resultater({
  go
}) {
  const [sel, setSel] = React.useState({
    g: 'Verksted',
    f: 'ytring'
  });
  const [plan, setPlan] = React.useState({});
  const [view, setView] = React.useState('Varmekart');
  const group = D.groups.find(g => g.name === sel.g);
  const fi = D.factors.findIndex(f => f.key === sel.f);
  const factor = D.factors[fi];
  const value = group.cells ? group.cells[fi] : null;
  const org = D.groups[0].cells[fi];
  const diff = value === null ? null : value - org;
  const scores = D.statementScores[sel.g + ':' + sel.f] || factor.statements.map((_, i) => Math.max(5, Math.min(95, (value || org) + [-3, -6, 7][i])));
  const quadrant = value === null ? null : value < 50 ? {
    label: 'Fiks først',
    bg: 'var(--op-peach2)',
    c: 'var(--op-dangerdeep)'
  } : value < 62 ? {
    label: 'Følg med',
    bg: 'var(--op-cream)',
    c: 'var(--op-cautiondeep)'
  } : {
    label: 'Hold ved like',
    bg: 'var(--op-mint)',
    c: 'var(--op-greendeep)'
  };
  const sugg = D.suggestions[sel.f] || D.suggestions.default;
  const comments = D.comments.filter(c => c.factor === sel.f).length;
  const legend = [['#E38258', 'Under 40'], ['#EC9B77', '40–49'], ['#F5DC96', '50–61'], ['#CFE7E4', '62–71'], ['#B5DAD4', '72+']];
  return /*#__PURE__*/React.createElement("main", {
    className: "animate-entry",
    style: page
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Medarbeiderunders\xF8kelse \xB7 lukket ", D.index.closed), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '6px 0 0',
      fontFamily: 'var(--font-display)',
      fontSize: 32,
      fontWeight: 600,
      lineHeight: 1.1
    }
  }, "Grunnlinje 2026"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      marginRight: 4,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '.09em',
      color: 'var(--op-mut)'
    }
  }, "M\xE5ling"), /*#__PURE__*/React.createElement(Pill, {
    selected: true
  }, "Grunnlinje 2026"), /*#__PURE__*/React.createElement(Pill, null, "Grunnlinje 2025"), /*#__PURE__*/React.createElement("span", {
    style: {
      margin: '0 4px 0 10px',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '.09em',
      color: 'var(--op-mut)'
    }
  }, "Sammenlign med"), /*#__PURE__*/React.createElement(Pill, {
    selected: true
  }, "2025"), /*#__PURE__*/React.createElement(Pill, null, "Ingen"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 24
    }
  }, [['Indeks', '61', '−3 fra året før', 'var(--op-danger)'], ['Svar', '82 %', '28 av 34', 'var(--op-mut)'], ['Tillit til tallene', 'Middels', '3 av 5 grupper over terskel', 'var(--op-mut)']].map(([k, v, s, c]) => /*#__PURE__*/React.createElement("span", {
    key: k
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '.11em',
      color: 'var(--op-mut)'
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 4,
      fontFamily: 'var(--font-display)',
      fontSize: 28,
      fontWeight: 600,
      lineHeight: 1
    }
  }, v), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 4,
      fontSize: 12,
      fontWeight: 600,
      color: c
    }
  }, s))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 7
    }
  }, ['Varmekart', 'Prioritet', 'Segmentprofil', 'Sammenlign', 'Utvikling'].map(v => /*#__PURE__*/React.createElement(Pill, {
    key: v,
    selected: view === v,
    onClick: () => setView(v)
  }, v)), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 8,
      fontSize: 12.5,
      color: 'var(--op-mut)'
    }
  }, view === 'Varmekart' ? 'Trykk på en celle for å se gruppen og faktoren' : view === 'Prioritet' ? 'Nede til venstre: lav skår og stor betydning — start der' : view === 'Segmentprofil' ? 'Velg en gruppe og trykk på en faktor' : view === 'Sammenlign' ? 'To grunnlinjer side om side — velg år over' : 'Alle målinger over tid — grunnlinjer og pulser')), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      display: 'grid',
      alignItems: 'start',
      gap: 18,
      gridTemplateColumns: 'minmax(0, 1.45fr) minmax(300px, 1fr)'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    as: "section",
    style: {
      padding: '22px 24px 20px'
    }
  }, view !== 'Varmekart' ? /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 14,
      border: '1px dashed var(--op-rule)',
      padding: '40px 26px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600
    }
  }, view, " er ikke gjenskapt i UI-kitet"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 5,
      fontSize: 13,
      color: 'var(--op-mut)'
    }
  }, "Se components/resultater/views.tsx i kildekoden.")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 700
    }
  }, "Gruppe \xD7 faktor"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: 'grid',
      gridTemplateColumns: '150px repeat(11, minmax(0, 1fr))',
      gap: '8px 6px',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", null), D.factors.map(f => /*#__PURE__*/React.createElement("span", {
    key: f.key,
    style: {
      textAlign: 'center',
      fontSize: 11.5,
      color: 'var(--op-mut)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, f.abbr)), D.groups.map(g => /*#__PURE__*/React.createElement(React.Fragment, {
    key: g.name
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0,
      paddingRight: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 14,
      fontWeight: 700,
      color: g.cells ? 'var(--op-ink)' : 'var(--op-mut)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, g.name), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 12,
      color: 'var(--op-mut)'
    }
  }, g.n, " svar")), D.factors.map((f, i) => g.cells ? /*#__PURE__*/React.createElement(HeatTile, {
    key: f.key,
    index: g.cells[i],
    size: "cell",
    selected: sel.g === g.name && sel.f === f.key,
    onClick: () => setSel({
      g: g.name,
      f: f.key
    }),
    style: {
      height: 52
    }
  }) : /*#__PURE__*/React.createElement(HeatTile, {
    key: f.key,
    masked: true,
    size: "cell",
    style: {
      height: 52
    }
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      fontSize: 12.5,
      color: 'var(--op-mut)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 14
    }
  }, legend.map(([c, l]) => /*#__PURE__*/React.createElement("span", {
    key: l,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 14,
      borderRadius: 4,
      background: c
    }
  }), l))), /*#__PURE__*/React.createElement("span", null, "\u2014 = under terskelen p\xE5 ", D.org.threshold, " svar")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      textAlign: 'right',
      fontSize: 12.5,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, "En gruppe med nok svar kan ogs\xE5 vises som \u2014 n\xE5r tallene ellers ville avsl\xF8rt en mindre gruppe."))), /*#__PURE__*/React.createElement(Card, {
    as: "section",
    style: {
      padding: '22px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, sel.g), quadrant ? /*#__PURE__*/React.createElement("span", {
    style: {
      borderRadius: 999,
      padding: '5px 11px',
      fontSize: 12,
      fontWeight: 700,
      background: quadrant.bg,
      color: quadrant.c
    }
  }, quadrant.label) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 32,
      fontWeight: 600,
      lineHeight: 1.1,
      textWrap: 'balance'
    }
  }, factor.name), value !== null ? /*#__PURE__*/React.createElement(HeatTile, {
    index: value,
    size: "cell",
    style: {
      width: 62,
      height: 56,
      flex: 'none',
      fontSize: 28,
      borderRadius: 12
    }
  }) : /*#__PURE__*/React.createElement(HeatTile, {
    masked: true,
    size: "cell",
    style: {
      width: 62,
      height: 56,
      flex: 'none',
      fontSize: 28,
      borderRadius: 12
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 13.5,
      color: 'var(--op-mut)'
    }
  }, value === null ? 'Vises ikke: for få svar' : diff === 0 ? 'Som hele virksomheten (' + org + ')' : Math.abs(diff) + (diff < 0 ? ' under' : ' over') + ' hele virksomheten (' + org + ')'), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, factor.statements.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      lineHeight: 1.45,
      textWrap: 'pretty'
    }
  }, s), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 'none',
      fontSize: 15,
      fontWeight: 700
    }
  }, value === null ? '—' : scores[i])), /*#__PURE__*/React.createElement(Meter, {
    pct: value === null ? 0 : scores[i],
    height: 6,
    color: heatTone(scores[i]).bg === '#F5DC96' ? '#E0A21F' : scores[i] < 50 ? '#D4633A' : '#5C9A55',
    style: {
      marginTop: 6
    }
  })))), /*#__PURE__*/React.createElement("a", {
    href: "#kommentarer",
    onClick: e => {
      e.preventDefault();
      go('kommentarer');
    },
    style: {
      display: 'inline-block',
      marginTop: 14,
      fontSize: 13.5,
      fontWeight: 700
    }
  }, comments === 0 ? 'Ingen har skrevet en kommentar om dette' : comments === 1 ? 'Se kommentaren om dette →' : 'Se alle ' + comments + ' kommentarer om dette →'), /*#__PURE__*/React.createElement(Eyebrow, {
    style: {
      marginTop: 20
    }
  }, "Foresl\xE5tte tiltak"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: 9
    }
  }, sugg.map(s => {
    const k = sel.f + ':' + s.t;
    const inPlan = !!plan[k];
    return /*#__PURE__*/React.createElement("div", {
      key: s.t,
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        borderRadius: 12,
        border: '1px solid var(--op-line)',
        background: 'var(--op-bg)',
        padding: '13px 16px'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        fontSize: 15,
        fontWeight: 600,
        textWrap: 'pretty'
      }
    }, s.t), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        marginTop: 2,
        fontSize: 12.5,
        color: 'var(--op-mut)'
      }
    }, s.m)), /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      tone: inPlan ? 'quiet' : 'primary',
      pad: 14,
      onClick: () => setPlan({
        ...plan,
        [k]: !inPlan
      })
    }, inPlan ? 'I planen ✓' : 'Legg i plan'));
  })))));
}
Object.assign(window, {
  Malinger,
  Resultater,
  Tabs
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Measure.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Shell.jsx
try { (() => {
// Orgpuls app shell — AppHeader (design 3 top layout), the help panel, the side rail, and AppFooter. Transcribed from components/shell/*.
const DS = window.OrgpulsDesignSystem_d91c81;
const {
  Logo,
  Segmented,
  AccountChip,
  CountBadge,
  Select,
  Eyebrow,
  Button
} = DS;
const D = window.OP_DATA;
function NavLink({
  item,
  current,
  trail,
  view,
  onClick,
  mobile
}) {
  const label = view === 'enkel' && item.enkel ? item.enkel : item.label;
  return /*#__PURE__*/React.createElement("a", {
    href: '#' + item.key,
    "aria-current": current ? 'page' : undefined,
    onClick: e => {
      e.preventDefault();
      onClick(item.key);
    },
    style: {
      display: 'flex',
      cursor: 'pointer',
      alignItems: 'center',
      gap: 7,
      borderRadius: 10,
      border: 'none',
      padding: '8px 13px',
      fontSize: 14,
      color: 'var(--op-ink)',
      textDecoration: 'none',
      background: current || trail ? 'var(--op-sbg)' : 'transparent',
      fontWeight: current ? 700 : 500,
      whiteSpace: 'nowrap'
    }
  }, label, /*#__PURE__*/React.createElement(CountBadge, {
    count: item.badge
  }));
}
function AppNav({
  screen,
  view,
  go
}) {
  const items = view === 'enkel' ? D.nav.filter(n => n.key === 'innsikt') : D.nav;
  return /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Hovedmeny",
    style: {
      display: 'flex',
      minWidth: 0,
      flex: '1 1 auto',
      gap: 2
    }
  }, items.map(n => /*#__PURE__*/React.createElement(NavLink, {
    key: n.key,
    item: n,
    current: screen === n.key,
    view: view,
    onClick: go
  })));
}
function LayoutToggle({
  side,
  onToggle
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: side ? 'Bytt til toppmeny' : 'Bytt til sidemeny og full bredde',
    "aria-label": side ? 'Bytt til toppmeny' : 'Bytt til sidemeny og full bredde',
    onClick: onToggle,
    style: {
      display: 'flex',
      height: 34,
      width: 34,
      cursor: 'pointer',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      border: '1px solid var(--op-line)',
      background: 'transparent',
      padding: 0,
      color: 'var(--op-ink)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    fill: "none",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "1.5",
    y: "2",
    width: "13",
    height: "12",
    rx: "2",
    stroke: "#191510",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: side ? 'M1.5 5.5h13' : 'M6 2v12',
    stroke: "#191510",
    strokeWidth: "1.5"
  })));
}
function HelpButton({
  open,
  onClick,
  compact
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Hjelp, grunnlag og assistent",
    "aria-expanded": open,
    onClick: onClick,
    style: {
      display: 'flex',
      height: 34,
      cursor: 'pointer',
      alignItems: 'center',
      gap: 8,
      borderRadius: 10,
      padding: '0 13px 0 4px',
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--op-ink)',
      fontFamily: 'inherit',
      border: '1px solid ' + (open ? 'var(--op-ink)' : 'var(--op-line)'),
      background: open ? 'var(--op-sbg)' : 'transparent'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'block',
      height: 26,
      width: 26,
      flex: 'none',
      borderRadius: 11,
      background: 'var(--op-bg) url(' + D.org.face + ') center/cover no-repeat'
    }
  }), compact ? null : /*#__PURE__*/React.createElement("span", null, "Hjelp"));
}
function AccountMenu({
  open,
  onClose,
  go
}) {
  if (!open) return null;
  const item = {
    display: 'flex',
    height: 38,
    alignItems: 'center',
    borderRadius: 10,
    padding: '0 12px',
    fontSize: 13.5,
    fontWeight: 600,
    color: 'var(--op-ink)',
    textDecoration: 'none',
    background: 'transparent',
    border: 'none',
    width: '100%',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: 0,
      top: 'calc(100% + 8px)',
      zIndex: 50,
      width: 272,
      borderRadius: 18,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: 8,
      boxShadow: 'var(--shadow-menu)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      borderBottom: '1px solid var(--op-line)',
      padding: '8px 12px 12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 14,
      fontWeight: 700
    }
  }, D.viewer.name), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 2,
      fontSize: 12.5,
      color: 'var(--op-mut)'
    }
  }, D.viewer.email), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 8,
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--op-mut)'
    }
  }, D.org.name, " AS \xB7 ", D.viewer.role)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      paddingTop: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: item,
    onClick: () => {
      onClose();
      go('oppsett');
    }
  }, "Oppsett"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: 40,
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      padding: '0 12px',
      fontSize: 13.5,
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", null, "Spr\xE5k"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      borderRadius: 999,
      padding: '4px 9px',
      fontSize: 11.5,
      fontWeight: 700,
      background: 'var(--op-sbg)'
    }
  }, "Norsk"), /*#__PURE__*/React.createElement("span", {
    style: {
      borderRadius: 999,
      padding: '4px 9px',
      fontSize: 11.5,
      fontWeight: 600,
      color: 'var(--op-mut)'
    }
  }, "English"))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: item,
    onClick: onClose
  }, "Logg ut")));
}
function HelpPanel({
  screen,
  mode,
  setMode,
  onClose
}) {
  const h = D.help[screen] || D.help.home;
  const tabs = [{
    value: 'help',
    label: 'Hjelp'
  }, {
    value: 'science',
    label: 'Grunnlag og lov'
  }, {
    value: 'tuva',
    label: 'Tuva',
    icon: D.org.face
  }];
  const linkBtn = {
    display: 'flex',
    height: 32,
    cursor: 'pointer',
    alignItems: 'center',
    borderRadius: 9,
    border: '1px solid var(--op-ink)',
    background: 'var(--op-sf)',
    padding: '0 13px',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--op-ink)',
    textDecoration: 'none',
    fontFamily: 'inherit'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid var(--op-line)',
      background: 'var(--op-sbg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      display: 'flex',
      maxWidth: 'var(--page-w, 1180px)',
      alignItems: 'flex-start',
      gap: 16,
      padding: '14px 28px 20px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(Segmented, {
    variant: "panel",
    options: tabs,
    value: mode,
    onChange: setMode,
    ariaLabel: "Hjelp, grunnlag og assistent"
  })), mode === 'help' ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 15,
      fontWeight: 700
    }
  }, h.title), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      display: 'grid',
      gap: 12,
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))'
    }
  }, h.steps.map((s, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      height: 21,
      width: 21,
      flex: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      background: 'var(--op-ink)',
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--op-sbg)'
    }
  }, i + 1), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      lineHeight: 1.55,
      textWrap: 'pretty'
    }
  }, s)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 14,
      borderTop: '1px solid rgba(25,21,16,.15)',
      paddingTop: 14
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Les mer om dette"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: linkBtn,
    onClick: e => e.preventDefault()
  }, "Still et sp\xF8rsm\xE5l"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: linkBtn,
    onClick: e => e.preventDefault()
  }, "Hele hjelpesiden \u2192"))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 11,
      display: 'grid',
      gap: 9,
      gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))'
    }
  }, D.help.articles.map(a => /*#__PURE__*/React.createElement("a", {
    key: a.title,
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      display: 'block',
      borderRadius: 12,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: '12px 14px',
      textAlign: 'left',
      color: 'var(--op-ink)',
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '.09em',
      color: 'var(--op-mut)'
    }
  }, a.cat), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--op-mut)'
    }
  }, a.min, " min")), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 5,
      display: 'block',
      fontSize: 13,
      fontWeight: 600,
      lineHeight: 1.35,
      textWrap: 'pretty'
    }
  }, a.title))))) : null, mode === 'science' ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(DS.Pill, {
    selected: true
  }, "Forskning"), /*#__PURE__*/React.createElement(DS.Pill, null, "Arbeidsmilj\xF8loven")), /*#__PURE__*/React.createElement(Eyebrow, {
    style: {
      marginTop: 13
    }
  }, "Hva dette bygger p\xE5"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 8,
      display: 'block',
      maxWidth: 820,
      fontSize: 13.5,
      lineHeight: 1.65,
      textWrap: 'pretty'
    }
  }, h.sci)) : null, mode === 'tuva' ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'block',
      height: 38,
      width: 38,
      flex: 'none',
      borderRadius: 11,
      background: 'var(--op-sf) url(' + D.org.face + ') center/cover'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 15,
      fontWeight: 700
    }
  }, "Kom i gang"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 2,
      display: 'block',
      fontSize: 13,
      lineHeight: 1.5,
      color: 'var(--op-mut)'
    }
  }, "Alt er satt opp. Jeg sier fra n\xE5r noe trenger deg."), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 13,
      display: 'grid',
      gap: 8,
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'
    }
  }, D.help.setup.map((s, i) => /*#__PURE__*/React.createElement("a", {
    key: s.label,
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      display: 'flex',
      width: '100%',
      alignItems: 'center',
      gap: 10,
      borderRadius: 11,
      border: '1px solid ' + (s.done ? 'var(--op-link)' : 'var(--op-rule)'),
      background: s.done ? 'var(--op-mint)' : 'var(--op-bg)',
      padding: '10px 12px',
      textAlign: 'left',
      color: 'var(--op-ink)',
      textDecoration: 'none',
      boxSizing: 'border-box'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      height: 20,
      width: 20,
      flex: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      border: '1.5px solid ' + (s.done ? 'var(--op-link)' : 'var(--op-rule)'),
      fontSize: 11,
      fontWeight: 700,
      color: s.done ? 'var(--op-greendeep)' : 'var(--op-mut)'
    }
  }, s.done ? '✓' : i + 1), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: s.done ? 400 : 600,
      textDecoration: s.done ? 'line-through' : 'none'
    }
  }, s.label)))), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 12,
      display: 'block',
      fontSize: 12.5,
      lineHeight: 1.55,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, "P\xE5 denne siden: ", h.steps[0]))) : null), /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Lukk",
    onClick: onClose,
    style: {
      height: 30,
      width: 30,
      flex: 'none',
      cursor: 'pointer',
      borderRadius: 999,
      border: '1px solid var(--op-ink)',
      background: 'transparent',
      padding: 0,
      fontSize: 15,
      lineHeight: 1,
      color: 'var(--op-ink)'
    }
  }, "\xD7")));
}
function AppHeader({
  screen,
  view,
  setView,
  side,
  setSide,
  panel,
  setPanel,
  go
}) {
  const [menu, setMenu] = React.useState(false);
  const current = D.nav.find(n => n.key === screen);
  const title = current ? view === 'enkel' && current.enkel ? current.enkel : current.label : screen === 'oppsett' ? 'Oppsett' : '';
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 40,
      borderBottom: '1px solid var(--op-line)',
      background: 'var(--op-sf)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      display: 'flex',
      maxWidth: 'var(--page-w, 1180px)',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '10px 18px',
      padding: '11px 28px'
    }
  }, side ? /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0,
      flex: '1 1 auto',
      fontFamily: 'var(--font-display)',
      fontSize: 17,
      fontWeight: 600
    }
  }, title) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("a", {
    href: "#innsikt",
    onClick: e => {
      e.preventDefault();
      go('innsikt');
    },
    style: {
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement(Logo, null)), /*#__PURE__*/React.createElement(AppNav, {
    screen: screen,
    view: view,
    go: go
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flex: 'none',
      alignItems: 'center',
      gap: 8,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(LayoutToggle, {
    side: side,
    onToggle: () => setSide(!side)
  }), side ? null : /*#__PURE__*/React.createElement(HelpButton, {
    open: !!panel,
    onClick: () => setPanel(panel ? null : 'help')
  }), /*#__PURE__*/React.createElement(Segmented, {
    options: [{
      value: 'enkel',
      label: 'Enkel'
    }, {
      value: 'full',
      label: 'Full'
    }],
    value: view,
    onChange: setView,
    ariaLabel: "Visning"
  }), /*#__PURE__*/React.createElement(Select, {
    size: "role",
    "aria-label": "Din rolle",
    defaultValue: "dl",
    options: [{
      value: 'dl',
      label: 'Daglig leder'
    }, {
      value: 'al',
      label: 'Avdelingsleder',
      disabled: true
    }, {
      value: 'vo',
      label: 'Verneombud',
      disabled: true
    }]
  }), /*#__PURE__*/React.createElement(AccountChip, {
    initials: D.viewer.initials,
    active: menu || screen === 'oppsett',
    label: 'Konto: ' + D.viewer.name,
    onClick: () => setMenu(!menu)
  }), /*#__PURE__*/React.createElement(AccountMenu, {
    open: menu,
    onClose: () => setMenu(false),
    go: go
  }))), panel ? /*#__PURE__*/React.createElement(HelpPanel, {
    screen: screen,
    mode: panel,
    setMode: setPanel,
    onClose: () => setPanel(null)
  }) : null);
}
function SideRail({
  screen,
  view,
  go,
  open,
  setOpen,
  panel,
  setPanel
}) {
  const items = view === 'enkel' ? D.nav.filter(n => n.key === 'innsikt') : D.nav;
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      position: 'sticky',
      top: 0,
      boxSizing: 'border-box',
      display: 'flex',
      height: '100vh',
      flex: 'none',
      flexDirection: 'column',
      overflow: 'hidden',
      borderRight: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: '14px 10px',
      transition: 'width 180ms ease-in-out',
      width: open ? 220 : 62
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#innsikt",
    "aria-label": "Orgpuls",
    onClick: e => {
      e.preventDefault();
      go('innsikt');
    },
    style: {
      display: 'flex',
      minWidth: 0,
      alignItems: 'center',
      gap: 10,
      borderRadius: 10,
      padding: '6px 8px',
      color: 'var(--op-ink)',
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    markOnly: true,
    size: 30
  }), open ? /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: 'nowrap',
      fontFamily: 'var(--font-display)',
      fontSize: 19,
      fontWeight: 600,
      letterSpacing: '-0.01em'
    }
  }, "Orgpuls") : null), /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Hovedmeny",
    style: {
      marginTop: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 3
    }
  }, items.map(n => {
    const cur = screen === n.key;
    const label = view === 'enkel' && n.enkel ? n.enkel : n.label;
    return /*#__PURE__*/React.createElement("a", {
      key: n.key,
      href: '#' + n.key,
      title: label,
      "aria-current": cur ? 'page' : undefined,
      onClick: e => {
        e.preventDefault();
        go(n.key);
      },
      style: {
        position: 'relative',
        display: 'flex',
        minWidth: 0,
        alignItems: 'center',
        gap: 11,
        borderRadius: 11,
        padding: 10,
        fontSize: 14,
        color: 'var(--op-ink)',
        textDecoration: 'none',
        background: cur ? 'var(--op-sbg)' : 'transparent',
        fontWeight: cur ? 700 : 500
      }
    }, /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        display: 'flex',
        height: 26,
        width: 26,
        flex: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '.02em',
        background: cur ? 'var(--op-ac)' : 'var(--op-track)'
      }
    }, n.icon), open ? /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }
    }, label) : null, n.badge ? /*#__PURE__*/React.createElement("span", {
      style: {
        position: open ? 'static' : 'absolute',
        right: 4,
        top: 4
      }
    }, /*#__PURE__*/React.createElement(CountBadge, {
      count: n.badge,
      size: 18
    })) : null);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Hjelp",
    "aria-label": "Hjelp, grunnlag og assistent",
    onClick: () => setPanel(panel ? null : 'help'),
    style: {
      display: 'flex',
      minWidth: 0,
      cursor: 'pointer',
      alignItems: 'center',
      gap: 11,
      borderRadius: 11,
      border: 'none',
      padding: '8px 10px',
      textAlign: 'left',
      fontSize: 13.5,
      fontWeight: 600,
      color: 'var(--op-ink)',
      fontFamily: 'inherit',
      background: panel ? 'var(--op-sbg)' : 'transparent'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'block',
      height: 26,
      width: 26,
      flex: 'none',
      borderRadius: 8,
      background: 'var(--op-bg) url(' + D.org.face + ') center/cover no-repeat'
    }
  }), open ? /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: 'nowrap'
    }
  }, "Hjelp") : null), /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: open ? 'Trekk sammen menyen' : 'Utvid menyen',
    "aria-expanded": open,
    onClick: () => setOpen(!open),
    style: {
      display: 'flex',
      minWidth: 0,
      cursor: 'pointer',
      alignItems: 'center',
      gap: 11,
      borderRadius: 11,
      border: 'none',
      background: 'transparent',
      padding: '8px 10px',
      textAlign: 'left',
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--op-mut)',
      fontFamily: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'flex',
      height: 26,
      width: 26,
      flex: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      border: '1px solid var(--op-line)',
      fontSize: 13
    }
  }, open ? '‹' : '›'), open ? /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: 'nowrap'
    }
  }, "Trekk sammen") : null)));
}
function AppFooter({
  go
}) {
  const cols = [{
    head: 'Produkt',
    links: [['Innsikt', 'innsikt'], ['Målinger', 'malinger'], ['Resultater', 'resultater'], ['Kommentarer', 'kommentarer'], ['Tiltak', 'tiltak']]
  }, {
    head: 'Oppsett',
    links: [['Selskap', 'oppsett'], ['Ansatte', 'oppsett'], ['Integrasjoner', 'oppsett'], ['Årshjulet', 'malinger']]
  }, {
    head: 'Hjelp',
    links: [['Alle artikler'], ['Kom i gang'], ['Anonymitet'], ['Kontakt oss']]
  }];
  const link = {
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    padding: 0,
    textAlign: 'left',
    fontSize: 12.5,
    color: 'var(--op-body)',
    textDecoration: 'none',
    fontFamily: 'inherit'
  };
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      borderTop: '1px solid var(--op-line)',
      background: 'var(--op-sf)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      maxWidth: 'var(--page-w, 1180px)',
      padding: '34px 28px 26px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 26,
      gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(auto-fit, minmax(140px, 1fr))'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    size: 28,
    wordmark: 18
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '11px 0 0',
      maxWidth: 280,
      fontSize: 12.5,
      lineHeight: 1.6,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, "Psykososialt arbeidsmilj\xF8 for norske virksomheter. Svar lagres i EU, og ingen enkeltsvar kan spores tilbake til en person."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 13,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      borderRadius: 999,
      background: 'var(--op-mint)',
      padding: '4px 10px',
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--op-greendeep)'
    }
  }, "Data i EU"), /*#__PURE__*/React.createElement("span", {
    style: {
      borderRadius: 999,
      background: 'var(--op-sbg)',
      padding: '4px 10px',
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--op-cautiondeep)'
    }
  }, "GDPR"))), cols.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.head,
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, c.head), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 11,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 8
    }
  }, c.links.map(([label, key]) => /*#__PURE__*/React.createElement("a", {
    key: label,
    href: key ? '#' + key : '#',
    style: link,
    onClick: e => {
      e.preventDefault();
      if (key) go(key);
    }
  }, label)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 26,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      borderTop: '1px solid var(--op-line)',
      paddingTop: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: 'var(--op-mut)'
    }
  }, "\xA9 2026 Orgpuls AS \xB7 orgpuls.no \xB7 hjelp@orgpuls.no"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 16,
      fontSize: 11.5,
      color: 'var(--op-mut)'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      color: 'var(--op-mut)',
      textDecoration: 'none'
    }
  }, "Databehandleravtale"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      color: 'var(--op-mut)',
      textDecoration: 'none'
    }
  }, "Personvern"), /*#__PURE__*/React.createElement("span", null, "Driftsstatus")))));
}
Object.assign(window, {
  AppHeader,
  SideRail,
  AppFooter,
  HelpPanel
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Work.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Kommentarer (components/kommentarer/Kommentarer.tsx) and Tiltak (components/tiltak/TiltakScreen.tsx + MeasureCard.tsx).
const DS = window.OrgpulsDesignSystem_d91c81;
const {
  Section,
  Button,
  Eyebrow,
  StatusPill,
  Input,
  Field,
  Select,
  Textarea,
  Chip
} = DS;
const D = window.OP_DATA;
const page = {
  margin: '0 auto',
  maxWidth: 'var(--page-w, 1180px)',
  padding: '30px 28px 60px'
};
const fname = k => D.factors.find(f => f.key === k).name;
const TONE = {
  negativ: {
    background: '#F0B9A0',
    color: '#6B240C'
  },
  blandet: {
    background: '#F5DC96',
    color: '#5C4600'
  },
  positiv: {
    background: '#CFE7E4',
    color: '#20431C'
  }
};
const TONE_LABEL = {
  negativ: 'Negativ',
  blandet: 'Blandet',
  positiv: 'Positiv'
};
function Comment({
  c,
  onReply
}) {
  const [draft, setDraft] = React.useState('');
  const [asking, setAsking] = React.useState(false);
  const age = c.needsReply ? {
    text: 'Venter · ' + c.waitingDays + (c.waitingDays === 1 ? ' dag' : ' dager'),
    colour: c.waitingDays >= 5 ? '#A33A16' : '#5F5849'
  } : {
    text: 'Besvart',
    colour: '#2F5D2A'
  };
  const quiet = {
    height: 30,
    flex: 'none',
    cursor: 'pointer',
    borderRadius: 10,
    border: '1px solid var(--op-line)',
    background: 'var(--op-sf)',
    padding: '0 11px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--op-ink)',
    fontFamily: 'inherit'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 13,
      border: '1px solid var(--op-line)',
      background: 'var(--op-bg)',
      padding: '14px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      borderRadius: 999,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: '2px 9px',
      fontSize: 11,
      fontWeight: 700
    }
  }, fname(c.factor)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: 'var(--op-mut)'
    }
  }, c.round, " \xB7 ", c.date), c.tone ? /*#__PURE__*/React.createElement("span", {
    style: {
      borderRadius: 999,
      padding: '2px 9px',
      fontSize: 10.5,
      fontWeight: 700,
      ...TONE[c.tone]
    }
  }, TONE_LABEL[c.tone]) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontSize: 11.5,
      fontWeight: 600,
      color: age.colour
    }
  }, age.text)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 9,
      fontSize: 14,
      lineHeight: 1.55,
      textWrap: 'pretty'
    }
  }, "\xAB", c.text, "\xBB"), c.thread.map((m, i) => m.author === 'leder' ? /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      marginTop: 10,
      borderRadius: 10,
      background: 'var(--op-mint)',
      padding: '10px 12px',
      fontSize: 13,
      lineHeight: 1.5,
      textWrap: 'pretty'
    }
  }, /*#__PURE__*/React.createElement("strong", null, "Du svarte:"), " ", m.body) : /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      marginTop: 10,
      fontSize: 14,
      lineHeight: 1.55
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      fontWeight: 600,
      color: 'var(--op-mut)'
    }
  }, "Svar fra ansatt:"), " \xAB", m.body, "\xBB")), c.needsReply ? /*#__PURE__*/React.createElement("form", {
    style: {
      marginTop: 11,
      display: 'flex',
      gap: 8
    },
    onSubmit: e => {
      e.preventDefault();
      if (draft.trim()) {
        onReply(c.id, draft.trim());
        setDraft('');
      }
    }
  }, /*#__PURE__*/React.createElement(Input, {
    size: "field",
    value: draft,
    onChange: e => setDraft(e.target.value),
    placeholder: "Svar anonymt \u2026",
    "aria-label": 'Svar anonymt på kommentaren om ' + fname(c.factor),
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    disabled: !draft.trim(),
    style: {
      height: 38,
      flex: 'none',
      cursor: draft.trim() ? 'pointer' : 'default',
      borderRadius: 10,
      border: '1px solid var(--op-ink)',
      background: 'var(--op-ac)',
      padding: '0 16px',
      fontSize: 12.5,
      fontWeight: 700,
      color: 'var(--op-ink)',
      fontFamily: 'inherit'
    }
  }, "Send")) : null, !asking ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 9
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: quiet,
    onClick: () => setAsking(true)
  }, "Be om direkte kontakt")) : /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      borderRadius: 10,
      border: '1px solid var(--op-ink)',
      background: 'var(--op-sbg)',
      padding: '11px 12px'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12.5,
      lineHeight: 1.55,
      textWrap: 'pretty'
    }
  }, "Den ansatte f\xE5r tilbud om \xE5 skrive til deg p\xE5 e-post, fra sin egen e-post. Da f\xE5r du vite hvem det er \u2013 men bare hvis den ansatte selv velger det. Du f\xE5r ikke vite om foresp\xF8rselen er sett."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 9,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: {
      ...quiet,
      border: '1px solid var(--op-ink)',
      background: 'var(--op-ac)',
      padding: '0 12px',
      fontWeight: 700
    },
    onClick: () => setAsking(false)
  }, "Send foresp\xF8rsel"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: quiet,
    onClick: () => setAsking(false)
  }, "Avbryt"))));
}
function Kommentarer() {
  const [items, setItems] = React.useState(D.comments);
  const [factor, setFactor] = React.useState(null);
  const [status, setStatus] = React.useState('alle');
  const [round, setRound] = React.useState('alle');
  const inRound = items.filter(c => round === 'alle' || c.round === round);
  const waiting = items.filter(c => c.needsReply).length;
  const keys = [...new Set(inRound.map(c => c.factor))];
  const themes = keys.map(k => {
    const cs = inRound.filter(c => c.factor === k);
    const neg = cs.filter(c => c.tone === 'negativ').length;
    const pos = cs.filter(c => c.tone === 'positiv').length;
    return {
      key: k,
      n: cs.length,
      tone: neg > pos ? 'negativ' : pos > neg ? 'positiv' : 'blandet'
    };
  }).sort((a, b) => b.n - a.n);
  const byStatus = (c, s) => s === 'alle' || (s === 'ubesvart' ? c.needsReply : !c.needsReply);
  const inScope = inRound.filter(c => factor === null || c.factor === factor);
  const shown = inScope.filter(c => byStatus(c, status)).sort((a, b) => a.needsReply !== b.needsReply ? Number(b.needsReply) - Number(a.needsReply) : b.waitingDays - a.waitingDays);
  const reply = (id, body) => setItems(items.map(c => c.id === id ? {
    ...c,
    needsReply: false,
    thread: [...c.thread, {
      author: 'leder',
      body
    }]
  } : c));
  const chip = on => ({
    cursor: 'pointer',
    borderRadius: 999,
    border: '1px solid ' + (on ? 'var(--op-ink)' : 'var(--op-line)'),
    background: on ? 'var(--op-ink)' : 'var(--op-sf)',
    color: on ? 'var(--op-bg)' : 'var(--op-ink)',
    fontFamily: 'inherit',
    fontWeight: 700,
    lineHeight: 'normal'
  });
  return /*#__PURE__*/React.createElement("main", {
    className: "animate-entry",
    style: page
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Anonyme kommentarer fra alle m\xE5linger \xB7 du svarer uten \xE5 vite hvem"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '6px 0 0',
      fontFamily: 'var(--font-display)',
      fontSize: 32,
      fontWeight: 600,
      lineHeight: 1.1
    }
  }, "Kommentarer"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      display: 'grid',
      alignItems: 'start',
      gap: 16,
      gridTemplateColumns: '300px minmax(0, 1fr)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 16,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: '18px 18px 14px'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 15,
      fontWeight: 700
    }
  }, "Temaer"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 3,
      fontSize: 12,
      lineHeight: 1.45,
      color: 'var(--op-mut)'
    }
  }, items.length, " kommentarer fra ", D.roundChips.length, " m\xE5linger. ", waiting, " venter p\xE5 svar."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, [{
    key: null,
    n: inRound.length,
    tone: null
  }, ...themes].map(th => {
    const on = factor === th.key;
    return /*#__PURE__*/React.createElement("button", {
      key: th.key || 'alle',
      type: "button",
      "aria-pressed": on,
      onClick: () => setFactor(th.key),
      style: {
        display: 'flex',
        width: '100%',
        cursor: 'pointer',
        alignItems: 'center',
        gap: 10,
        borderRadius: 11,
        border: '1px solid ' + (on ? 'var(--op-ink)' : 'var(--op-line)'),
        background: on ? 'var(--op-sbg)' : 'var(--op-sf)',
        padding: '10px 12px',
        textAlign: 'left',
        color: 'var(--op-ink)',
        fontFamily: 'inherit'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        minWidth: 0,
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        fontSize: 13,
        fontWeight: 700
      }
    }, th.key ? fname(th.key) : 'Alle temaer'), /*#__PURE__*/React.createElement("span", {
      style: {
        marginTop: 1,
        display: 'block',
        fontSize: 11,
        color: 'var(--op-mut)'
      }
    }, th.n, " ", th.n === 1 ? 'kommentar' : 'kommentarer')), th.tone ? /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 'none',
        borderRadius: 999,
        padding: '3px 9px',
        fontSize: 10.5,
        fontWeight: 700,
        ...TONE[th.tone]
      }
    }, TONE_LABEL[th.tone]) : null);
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 14,
      background: 'var(--op-sbg)',
      padding: '14px 16px',
      fontSize: 12.5,
      lineHeight: 1.55,
      textWrap: 'pretty'
    }
  }, "Du svarer uten \xE5 vite hvem som skrev. Gruppen vises aldri ved en kommentar, heller ikke n\xE5r den har mange svar.")), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      borderRadius: 16,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: '20px 22px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 22,
      fontWeight: 600
    }
  }, factor ? fname(factor) : 'Alle kommentarer'), factor ? /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      fontSize: 12.5,
      fontWeight: 700
    }
  }, "Se tallene og forslagene \u2192") : null), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6
    }
  }, [['alle', 'Alle'], ['ubesvart', 'Ubesvart'], ['besvart', 'Besvart']].map(([s, l]) => /*#__PURE__*/React.createElement("button", {
    key: s,
    type: "button",
    "aria-pressed": status === s,
    onClick: () => setStatus(s),
    style: {
      ...chip(status === s),
      padding: '7px 13px',
      fontSize: 12.5
    }
  }, l, " \xB7 ", inScope.filter(c => byStatus(c, s)).length)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      marginRight: 4,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '.09em',
      color: 'var(--op-mut)'
    }
  }, "M\xE5ling"), [{
    id: 'alle',
    title: 'Alle målinger'
  }, ...D.roundChips].map(r => /*#__PURE__*/React.createElement("button", {
    key: r.id,
    type: "button",
    "aria-pressed": round === (r.id === 'alle' ? 'alle' : r.title),
    onClick: () => {
      setRound(r.id === 'alle' ? 'alle' : r.title);
      setFactor(null);
    },
    style: {
      ...chip(round === (r.id === 'alle' ? 'alle' : r.title)),
      padding: '6px 12px',
      fontSize: 12
    }
  }, r.title, " \xB7 ", r.id === 'alle' ? items.length : items.filter(c => c.round === r.title).length))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, shown.map(c => /*#__PURE__*/React.createElement(Comment, {
    key: c.id,
    c: c,
    onReply: reply
  })), shown.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 12,
      border: '1px dashed var(--op-rule)',
      padding: 18,
      textAlign: 'center',
      fontSize: 13,
      color: 'var(--op-mut)'
    }
  }, "Ingen kommentarer i dette utvalget.") : null))));
}
function MeasureCard({
  m,
  onAdvance
}) {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState(m.kind);
  const f = D.factors.find(x => x.key === m.factor);
  const pill = m.late ? {
    background: '#FBD5C4',
    color: '#6B240C'
  } : m.step >= 4 ? {
    background: '#CFE7E4',
    color: '#20431C'
  } : {
    background: '#FBEBBE',
    color: '#5C4600'
  };
  const closed = m.step >= 5;
  const action = closed ? 'Lukket' : m.step === 3 ? 'Registrer effekt' : 'Flytt videre';
  const CONTROL = {
    size: 'control'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 16,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: '20px 22px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 9
    }
  }, /*#__PURE__*/React.createElement(StatusPill, {
    tone: "factor"
  }, f.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: 'var(--op-mut)'
    }
  }, f.law), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: 'var(--op-mut)'
    }
  }, "\xB7 fra Grunnlinje 2026")), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 9,
      display: 'block',
      fontSize: 16,
      fontWeight: 600,
      textWrap: 'pretty'
    }
  }, m.title), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 3,
      display: 'block',
      fontSize: 12.5,
      color: 'var(--op-mut)'
    }
  }, m.owner, " \xB7 ", m.due)), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 'none',
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      borderRadius: 999,
      padding: '5px 12px',
      fontSize: 11.5,
      fontWeight: 700,
      ...pill
    }
  }, m.late ? 'Over frist' : D.steps[m.step]))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18,
      display: 'flex',
      alignItems: 'center',
      overflowX: 'auto'
    }
  }, D.steps.map((s, i) => /*#__PURE__*/React.createElement("span", {
    key: s,
    style: {
      minWidth: 76,
      flex: 1,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      height: 6,
      borderRadius: 999,
      background: i <= m.step ? i >= 4 ? '#2F5D2A' : '#F5C64A' : '#E8DFC9'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 6,
      display: 'block',
      fontSize: 10.5,
      fontWeight: i === m.step ? 700 : 500,
      color: i === m.step ? 'var(--op-ink)' : 'var(--op-mut)'
    }
  }, s)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      borderTop: '1px solid var(--op-line)',
      paddingTop: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      maxWidth: 520,
      fontSize: 12.5,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, m.goal), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    tone: "secondary",
    pad: 15,
    "aria-expanded": open,
    onClick: () => setOpen(!open)
  }, open ? 'Lukk' : 'Rediger'), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    pad: 16,
    disabled: closed,
    style: closed ? {
      background: 'transparent'
    } : m.step === 3 ? {
      background: '#CFE7E4'
    } : undefined,
    onClick: () => onAdvance(m.id)
  }, action))), open ? /*#__PURE__*/React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      setOpen(false);
    },
    style: {
      marginTop: 16,
      borderRadius: 14,
      border: '1px solid var(--op-line)',
      background: 'var(--op-bg)',
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      color: 'var(--op-mut)'
    }
  }, "Handlingsplan"), /*#__PURE__*/React.createElement(Field, {
    label: "Tiltak",
    style: {
      marginTop: 13
    }
  }, /*#__PURE__*/React.createElement(Input, {
    size: "md",
    defaultValue: m.title
  })), /*#__PURE__*/React.createElement(Field, {
    label: "M\xE5l \u2014 hva skal v\xE6re annerledes",
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement(Textarea, {
    defaultValue: m.goal
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      display: 'grid',
      gap: 12,
      gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))'
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Ansvarlig"
  }, /*#__PURE__*/React.createElement(Select, _extends({}, CONTROL, {
    defaultValue: m.owner,
    options: [{
      value: '',
      label: 'Ikke satt'
    }, {
      value: 'Kari Nordmann',
      label: 'Kari Nordmann'
    }, {
      value: 'Ola Hansen',
      label: 'Ola Hansen'
    }]
  }))), /*#__PURE__*/React.createElement(Field, {
    label: "Oppstart"
  }, /*#__PURE__*/React.createElement(Input, {
    type: "date",
    defaultValue: "2026-03-01"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Frist"
  }, /*#__PURE__*/React.createElement(Input, {
    type: "date",
    defaultValue: "2026-06-30"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "M\xE5l (indeks 0\u2013100)"
  }, /*#__PURE__*/React.createElement(Input, {
    type: "number",
    min: 0,
    max: 100,
    defaultValue: 55
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Faktor"
  }, /*#__PURE__*/React.createElement(Select, _extends({}, CONTROL, {
    defaultValue: m.factor,
    options: D.factors.map(x => ({
      value: x.key,
      label: x.name
    }))
  }))), /*#__PURE__*/React.createElement(Field, {
    label: "Status"
  }, /*#__PURE__*/React.createElement(Select, _extends({}, CONTROL, {
    defaultValue: String(m.step),
    options: D.steps.map((s, i) => ({
      value: String(i),
      label: s
    }))
  })))), /*#__PURE__*/React.createElement("fieldset", {
    style: {
      marginTop: 14,
      minWidth: 0,
      border: 0,
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("legend", {
    style: {
      marginBottom: 7,
      display: 'block',
      padding: 0,
      fontSize: 12,
      color: 'var(--op-mut)'
    }
  }, "Type tiltak"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(Chip, {
    type: "radio",
    name: 'kind' + m.id,
    value: "kollektivt",
    label: "Kollektivt",
    checked: kind === 'kollektivt',
    onChange: () => setKind('kollektivt')
  }), /*#__PURE__*/React.createElement(Chip, {
    type: "radio",
    name: 'kind' + m.id,
    value: "individuelt",
    label: "Individuelt",
    checked: kind === 'individuelt',
    onChange: () => setKind('individuelt')
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 8,
      display: 'block',
      maxWidth: 540,
      fontSize: 12,
      lineHeight: 1.5,
      textWrap: 'pretty',
      color: kind === 'individuelt' ? 'var(--op-caution)' : 'var(--op-mut)'
    }
  }, kind === 'individuelt' ? 'Arbeidstilsynet ber om at kollektive tiltak vurderes først. Individrettede tiltak bør begrunnes.' : 'Retter seg mot hvordan arbeidet er organisert. Dette er det loven foretrekker.')), /*#__PURE__*/React.createElement("fieldset", {
    style: {
      marginTop: 14,
      minWidth: 0,
      border: 0,
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("legend", {
    style: {
      marginBottom: 7,
      display: 'block',
      padding: 0,
      fontSize: 12,
      color: 'var(--op-mut)'
    }
  }, "Hvem ber\xF8res"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 7
    }
  }, ['Drift', 'Prosjekt', 'Verksted', 'Administrasjon'].map(g => /*#__PURE__*/React.createElement(GroupChip, {
    key: g,
    label: g,
    initial: m.groups.includes(g)
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18,
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 10,
      borderTop: '1px solid var(--op-line)',
      paddingTop: 14
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    tone: "danger",
    pad: 15,
    onClick: () => setOpen(false)
  }, "Slett tiltaket"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    pad: 18,
    type: "submit"
  }, "Ferdig"))) : null);
}
function GroupChip({
  label,
  initial
}) {
  const [on, setOn] = React.useState(initial);
  return /*#__PURE__*/React.createElement(Chip, {
    type: "checkbox",
    label: label,
    checked: on,
    onChange: () => setOn(!on),
    height: 32,
    padding: 13,
    fontSize: 12
  });
}
function Tiltak() {
  const [measures, setMeasures] = React.useState(D.measures);
  const [tab, setTab] = React.useState('Liste');
  const [status, setStatus] = React.useState('apne');
  const [owner, setOwner] = React.useState(null);
  const bucket = m => m.step >= 5 ? 'lukket' : m.late ? 'frist' : m.step === 3 ? 'effekt' : 'apne';
  const counts = b => b === 'alle' ? measures.length : b === 'apne' ? measures.filter(m => bucket(m) !== 'lukket').length : measures.filter(m => bucket(m) === b).length;
  const shown = measures.filter(m => (status === 'alle' ? true : status === 'apne' ? bucket(m) !== 'lukket' : bucket(m) === status) && (owner === null || m.owner === owner));
  const advance = id => setMeasures(measures.map(m => m.id === id && m.step < 5 ? {
    ...m,
    step: m.step + 1,
    late: false,
    due: m.step + 1 === 3 ? 'Gjennomført i dag' : m.due
  } : m));
  const filters = [['apne', 'Åpne'], ['frist', 'Over frist'], ['effekt', 'Venter effekt'], ['lukket', 'Lukket'], ['alle', 'Alle']];
  const tiles = [['frist', 'Over frist', '#FBD5C4', '#6B240C'], ['apne', 'Åpne tiltak', '#FBEBBE', '#5C4600'], ['effekt', 'Venter effektmåling', '#CFE7E4', '#20431C']];
  const chipS = on => ({
    display: 'inline-flex',
    height: 32,
    flex: 'none',
    alignItems: 'center',
    borderRadius: 999,
    border: '1px solid ' + (on ? 'var(--op-ink)' : 'var(--op-line)'),
    background: on ? 'var(--op-sbg)' : 'transparent',
    padding: '0 13px',
    fontSize: 12,
    color: 'var(--op-ink)',
    textDecoration: 'none',
    fontWeight: on ? 700 : 500,
    cursor: 'pointer',
    fontFamily: 'inherit'
  });
  return /*#__PURE__*/React.createElement("main", {
    className: "animate-entry",
    style: page
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      alignItems: 'start',
      gap: 20,
      gridTemplateColumns: 'minmax(0, 1.25fr) minmax(300px, 0.75fr)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 32,
      fontWeight: 600,
      lineHeight: 1.1
    }
  }, "Tiltak"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '9px 0 0',
      maxWidth: 560,
      fontSize: 14.5,
      lineHeight: 1.6,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, "Hvert tiltak henger p\xE5 en faktor og kan ikke lukkes f\xF8r effekten er m\xE5lt. Det er den dokumentasjonen Arbeidstilsynet ber om.")), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      borderRadius: 18,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: '18px 20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Status"), /*#__PURE__*/React.createElement(Button, {
    size: "tiny"
  }, "\uFF0B Nytt tiltak")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 9
    }
  }, tiles.map(([k, l, bg, c]) => /*#__PURE__*/React.createElement("span", {
    key: k,
    style: {
      display: 'block',
      borderRadius: 12,
      padding: '10px 11px',
      background: bg
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 20,
      fontWeight: 700,
      lineHeight: 1,
      color: c
    }
  }, counts(k)), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 4,
      display: 'block',
      fontSize: 11,
      fontWeight: 600,
      lineHeight: 1.25,
      color: c
    }
  }, l)))))), /*#__PURE__*/React.createElement(window.Tabs, {
    tabs: ['Tavle', 'Liste'],
    value: tab,
    onChange: setTab,
    counts: {
      Tavle: measures.filter(m => m.step > 0 && m.step < 5).length,
      Liste: measures.length
    }
  }), tab === 'Tavle' ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      borderRadius: 18,
      border: '1px dashed var(--op-rule)',
      background: 'var(--op-sf)',
      padding: '34px 26px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600
    }
  }, "Tavlen er ikke gjenskapt i UI-kitet"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 5,
      fontSize: 13,
      color: 'var(--op-mut)'
    }
  }, "Se components/tiltak/Board.tsx i kildekoden.")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 22,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8
    }
  }, filters.map(([k, l]) => {
    const on = status === k;
    return /*#__PURE__*/React.createElement("button", {
      key: k,
      type: "button",
      "aria-pressed": on,
      onClick: () => setStatus(k),
      style: {
        display: 'inline-flex',
        height: 36,
        flex: 'none',
        alignItems: 'center',
        borderRadius: 999,
        border: '1px solid ' + (on ? 'var(--op-ink)' : 'var(--op-line)'),
        background: on ? 'var(--op-ink)' : 'transparent',
        color: on ? 'var(--op-bg)' : 'var(--op-ink)',
        padding: '0 15px',
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit'
      }
    }, l, " \xB7 ", counts(k));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      marginRight: 4,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.09em',
      color: 'var(--op-mut)'
    }
  }, "M\xE5ling"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: chipS(true)
  }, "Alle m\xE5linger"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: chipS(false)
  }, "Grunnlinje 2026"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: chipS(false)
  }, "Puls \xB7 november 2025")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      marginRight: 4,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.09em',
      color: 'var(--op-mut)'
    }
  }, "Tildelt"), [null, 'Kari Nordmann', 'Ola Hansen'].map(o => /*#__PURE__*/React.createElement("button", {
    key: o || 'alle',
    type: "button",
    onClick: () => setOwner(o),
    style: chipS(owner === o)
  }, o || 'Alle'))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, shown.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 18,
      border: '1px dashed var(--op-rule)',
      background: 'var(--op-sf)',
      padding: '34px 26px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600
    }
  }, "Ingen tiltak i denne visningen"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 5,
      fontSize: 13,
      color: 'var(--op-mut)'
    }
  }, "Bytt status eller m\xE5ling for \xE5 se de andre.")) : null, shown.map(m => /*#__PURE__*/React.createElement(MeasureCard, {
    key: m.id,
    m: m,
    onAdvance: advance
  })))));
}
Object.assign(window, {
  Kommentarer,
  Tiltak,
  MeasureCard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Work.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/data.js
try { (() => {
// Demo fixture for the Orgpuls app UI kit — the design's own organisation (Nordvik Anlegg, 34 ansatte, index 61, −3, 28 av 34 · 82 %).
window.OP_DATA = {
  org: {
    name: 'Nordvik Anlegg',
    employees: 34,
    threshold: 5,
    lawMode: true,
    face: '../../assets/tuva/av1.png'
  },
  viewer: {
    initials: 'KN',
    name: 'Kari Nordmann',
    email: 'kari@nordvik-anlegg.no',
    role: 'Daglig leder'
  },
  nav: [{
    key: 'innsikt',
    label: 'Innsikt',
    enkel: 'Oversikt',
    icon: '◉'
  }, {
    key: 'malinger',
    label: 'Målinger',
    icon: '◷'
  }, {
    key: 'resultater',
    label: 'Resultater',
    icon: '▤'
  }, {
    key: 'kommentarer',
    label: 'Kommentarer',
    icon: '❝',
    badge: 4
  }, {
    key: 'tiltak',
    label: 'Tiltak',
    icon: '✓'
  }],
  index: {
    value: 61,
    delta: -3,
    answered: 28,
    headcount: 34,
    pct: 82,
    bands: {
      lav: 5,
      middels: 4,
      hoy: 2
    },
    closed: '14. februar 2026'
  },
  factors: [{
    key: 'ytring',
    name: 'Ytringsklima',
    abbr: 'Ytring',
    index: 41,
    delta: -7,
    law: '§ 4-3 (1)',
    statements: ['Jeg kan si fra om kritikkverdige forhold uten å frykte konsekvenser', 'Når noen melder fra om et problem, skjer det noe med det', 'Uenighet blir tatt opp åpent hos oss, ikke i gangen etterpå']
  }, {
    key: 'mengde',
    name: 'Arbeidsmengde',
    abbr: 'Mengde',
    index: 44,
    delta: -9,
    law: '§ 4-1 (2)',
    statements: ['Arbeidsmengden min er til å håndtere over tid', 'Jeg har nok tid til å gjøre jobben godt nok', 'Jeg kan koble av fra jobben når arbeidsdagen er over']
  }, {
    key: 'motstrid',
    name: 'Motstridende krav',
    abbr: 'Motstrid',
    index: 52,
    delta: -6,
    law: '§ 4-1 (2)',
    statements: ['Jeg får sjelden oppgaver uten å vite hva som skal prioriteres ned', 'Kravene fra ulike hold henger sammen', 'Jeg vet hvem som bestemmer når to ting kolliderer']
  }, {
    key: 'kontakt',
    name: 'Kontakt og kommunikasjon',
    abbr: 'Kontakt',
    index: 57,
    delta: 0,
    law: '§ 4-3 (2)',
    statements: ['Jeg har mulighet til kontakt med kollegaer i løpet av arbeidsdagen', 'Jeg kan tilkalle hjelp raskt hvis noe skjer mens jeg er alene', 'Jeg føler meg ikke isolert i jobben min']
  }, {
    key: 'emosjon',
    name: 'Emosjonelle krav',
    abbr: 'Emosjon',
    index: 58,
    delta: -1,
    law: '§ 4-3 (1)',
    statements: ['Jeg blir sjelden stående alene i følelsesmessig krevende situasjoner', 'Vi snakker om vanskelige hendelser etterpå', 'Jeg får lov til å reagere som menneske på jobb']
  }, {
    key: 'leder',
    name: 'Støtte fra leder',
    abbr: 'Leder',
    index: 64,
    delta: -5,
    law: '§ 4-1 (1)',
    statements: ['Jeg får støtte fra lederen min når jobben blir krevende', 'Lederen min vet nok om hva jobben min faktisk innebærer', 'Jeg kan ta opp vanskelige ting med lederen min']
  }, {
    key: 'medvirk',
    name: 'Medvirkning',
    abbr: 'Medvirk.',
    index: 66,
    delta: 3,
    law: '§ 4-2 (2)',
    statements: ['Jeg har innflytelse over hvordan jeg utfører arbeidet', 'Jeg blir hørt når noe skal endres', 'Jeg kan påvirke tempoet i eget arbeid']
  }, {
    key: 'integritet',
    name: 'Integritet og verdighet',
    abbr: 'Integr.',
    index: 69,
    delta: -1,
    law: '§ 4-3 (1)',
    statements: ['Jeg blir møtt med respekt uansett hvem jeg er', 'Jeg får bruke faglig skjønn når jeg mener noe bør gjøres annerledes', 'Grensene mine for privatliv blir respektert på jobb']
  }, {
    key: 'rolle',
    name: 'Rolleklarhet',
    abbr: 'Rolle',
    index: 71,
    delta: -2,
    law: '§ 4-2 (2)',
    statements: ['Jeg vet hva som forventes av meg i jobben min', 'Jeg vet hvor mitt ansvar slutter og andres begynner', 'Jeg vet hva som regnes som godt arbeid hos oss']
  }, {
    key: 'kollega',
    name: 'Støtte fra kollegaer',
    abbr: 'Kolleger',
    index: 76,
    delta: 1,
    law: '§ 4-3 (1)',
    statements: ['Kollegaene mine stiller opp når jeg trenger hjelp', 'Vi deler kunnskap i stedet for å holde på den', 'Jeg føler meg som en del av laget']
  }, {
    key: 'mening',
    name: 'Mening og anerkjennelse',
    abbr: 'Mening',
    index: 78,
    delta: 4,
    law: '§ 4-3 (1)',
    statements: ['Arbeidet jeg gjør betyr noe', 'Innsatsen min blir lagt merke til', 'Jeg er stolt av å jobbe her']
  }],
  // the heat map: group × factor, in factor order; null = withheld
  groups: [{
    name: 'Hele virksomheten',
    n: 28,
    cells: [41, 44, 52, 57, 58, 64, 66, 69, 71, 76, 78]
  }, {
    name: 'Drift',
    n: 8,
    cells: null,
    protectedNote: true
  }, {
    name: 'Prosjekt',
    n: 9,
    cells: [46, 31, 44, 57, 57, 58, 64, 69, 59, 74, 75]
  }, {
    name: 'Verksted',
    n: 8,
    cells: [28, 47, 53, 57, 55, 55, 66, 69, 72, 77, 77]
  }, {
    name: 'Administrasjon',
    n: 3,
    cells: null
  }],
  // statement scores behind a selected cell (group → factor key → three values)
  statementScores: {
    'Verksted:ytring': [25, 22, 38],
    'Hele virksomheten:ytring': [38, 36, 49],
    'Hele virksomheten:mengde': [40, 42, 50]
  },
  suggestions: {
    ytring: [{
      t: 'Svar på hver melding innen fem dager',
      m: 'Rutine · Løpende'
    }, {
      t: 'Workshop: Hva hindrer oss i å si fra?',
      m: 'Workshop · 90 min'
    }, {
      t: 'Lederen spør først og snakker sist',
      m: 'Lederpraksis · I hvert møte'
    }],
    mengde: [{
      t: 'Ukentlig prioriteringsmøte på 15 minutter',
      m: 'Rutine · Hver mandag'
    }, {
      t: 'Synlig oppgavetavle per team',
      m: 'Verktøy · Innen 2 uker'
    }, {
      t: 'Avtalt stopptid for henvendelser',
      m: 'Lederpraksis · Løpende'
    }],
    default: [{
      t: 'Ta funnet opp i neste personalmøte',
      m: 'Dialog · 30 min'
    }, {
      t: 'La teamet foreslå ett tiltak selv',
      m: 'Medvirkning · Innen 2 uker'
    }, {
      t: 'Følg opp i neste puls',
      m: 'Måling · Automatisk'
    }]
  },
  measures: [{
    id: 'm1',
    factor: 'ytring',
    title: 'Svar på hver melding innen fem dager',
    owner: 'Kari Nordmann',
    due: 'Frist gikk ut i går',
    late: true,
    step: 2,
    goal: 'Alle meldinger i avvikssystemet får et svar innen fem virkedager — også når svaret er «vi ser på det».',
    kind: 'kollektivt',
    groups: ['Drift', 'Verksted']
  }, {
    id: 'm2',
    factor: 'ytring',
    title: 'Workshop: Hva hindrer oss i å si fra?',
    owner: 'Ola Hansen',
    due: 'Frist 30. juni',
    late: false,
    step: 1,
    goal: 'Teamene setter ord på hva som stopper dem, og velger én ting å endre.',
    kind: 'kollektivt',
    groups: ['Verksted']
  }, {
    id: 'm3',
    factor: 'mengde',
    title: 'Ukentlig prioriteringsmøte på 15 minutter',
    owner: 'Kari Nordmann',
    due: 'Frist 12. mai',
    late: false,
    step: 3,
    goal: 'Hver mandag: hva skal ned når noe nytt kommer inn.',
    kind: 'kollektivt',
    groups: ['Prosjekt']
  }, {
    id: 'm4',
    factor: 'leder',
    title: 'Faste én-til-én-samtaler hver fjerde uke',
    owner: 'Ola Hansen',
    due: 'Gjennomført 2. mars',
    late: false,
    step: 3,
    goal: 'Alle i Prosjekt har en avtalt samtale med nærmeste leder.',
    kind: 'kollektivt',
    groups: ['Prosjekt']
  }],
  steps: ['Foreslått', 'Besluttet', 'Pågår', 'Gjennomført', 'Effekt målt', 'Lukket'],
  rounds: [{
    id: 'r3',
    kind: 'puls',
    title: 'Puls · juni 2026',
    meta: 'Ytringsklima, Arbeidsmengde · 6 spørsmål',
    state: 'neste',
    answered: null,
    pct: null,
    date: '4. juni'
  }, {
    id: 'r4',
    kind: 'puls',
    title: 'Puls · september 2026',
    meta: 'Faktorer med åpne tiltak · ca. 1 min',
    state: 'planlagt',
    answered: null,
    pct: null,
    date: '2. september'
  }, {
    id: 'r5',
    kind: 'grunnlinje',
    title: 'Grunnlinje 2027',
    meta: 'Hele instrumentet · 33 påstander + 4 spørsmål',
    state: 'planlagt',
    answered: null,
    pct: null,
    date: '2. februar 2027'
  }],
  latest: {
    title: 'Grunnlinje 2026',
    closed: '14. februar',
    answered: 28,
    headcount: 34,
    pct: 82
  },
  participation: [{
    name: 'Drift',
    pct: 100,
    answered: 8,
    total: 8
  }, {
    name: 'Prosjekt',
    pct: 90,
    answered: 9,
    total: 10
  }, {
    name: 'Verksted',
    pct: 73,
    answered: 8,
    total: 11
  }, {
    name: 'Administrasjon',
    pct: null,
    answered: null,
    total: 5,
    thin: true
  }],
  comments: [{
    id: 'c1',
    factor: 'ytring',
    round: 'Grunnlinje 2026',
    date: '14. feb',
    tone: 'negativ',
    text: 'Det er lett å si at vi skal si fra, men sist noen gjorde det ble det stille i to uker og så skjedde ingenting.',
    waitingDays: 6,
    needsReply: true,
    thread: []
  }, {
    id: 'c2',
    factor: 'mengde',
    round: 'Grunnlinje 2026',
    date: '14. feb',
    tone: 'negativ',
    text: 'Vi får nye oppgaver uten at noe tas vekk. Jeg vet aldri hva som skal vente.',
    waitingDays: 5,
    needsReply: true,
    thread: []
  }, {
    id: 'c3',
    factor: 'ytring',
    round: 'Grunnlinje 2026',
    date: '13. feb',
    tone: 'blandet',
    text: 'Nærmeste leder er grei å snakke med, men det stopper opp lenger opp i systemet.',
    waitingDays: 3,
    needsReply: true,
    thread: []
  }, {
    id: 'c4',
    factor: 'leder',
    round: 'Grunnlinje 2026',
    date: '13. feb',
    tone: 'positiv',
    text: 'Setter pris på at lederen min faktisk kommer ut på anlegget og ser hva vi driver med.',
    waitingDays: 2,
    needsReply: true,
    thread: []
  }, {
    id: 'c5',
    factor: 'ytring',
    round: 'Grunnlinje 2026',
    date: '12. feb',
    tone: 'negativ',
    text: 'Møtene er for store til at noen tør å være uenige.',
    waitingDays: 0,
    needsReply: false,
    thread: [{
      author: 'leder',
      body: 'Takk. Vi prøver mindre møter per team fra mars, og tar opp dette på personalmøtet.'
    }]
  }, {
    id: 'c6',
    factor: 'ytring',
    round: 'Puls · november 2025',
    date: '5. nov',
    tone: 'blandet',
    text: 'Bedre enn før, men fortsatt avhengig av hvem som er på jobb.',
    waitingDays: 0,
    needsReply: false,
    thread: [{
      author: 'leder',
      body: 'Lest. Vi følger dette opp i neste puls.'
    }]
  }, {
    id: 'c7',
    factor: 'kollega',
    round: 'Puls · november 2025',
    date: '4. nov',
    tone: 'positiv',
    text: 'Gjengen på verkstedet stiller alltid opp.',
    waitingDays: 0,
    needsReply: false,
    thread: [{
      author: 'leder',
      body: 'Det er godt å høre — takk.'
    }]
  }],
  roundChips: [{
    id: 'g26',
    title: 'Grunnlinje 2026'
  }, {
    id: 'p25',
    title: 'Puls · november 2025'
  }],
  help: {
    home: {
      title: 'Slik bruker du Innsikt',
      steps: ['Les de tre punktene under «Venter på deg». Er de tomme, er du à jour.', 'Sløyfen viser hvor dere står i lovkravet. Står dere fast på ett trinn, er det der jobben ligger.', 'Bytt rolle øverst til høyre for å se nøyaktig det avdelingslederne og verneombudet ser.'],
      sci: 'Indeksen er et vektet snitt av de elleve faktorene, regnet om fra 1–5 til 0–100. En endring under tre poeng ligger innenfor normal variasjon og bør ikke tolkes som en trend. Kilde: QPS Nordic brukerveiledning, STAMI.'
    },
    malinger: {
      title: 'Slik bruker du Målinger',
      steps: ['Grunnlinjen er den lovpålagte. Den tas én gang i året og setter nullpunktet.', 'Pulsen måler bare faktorene dere har åpne tiltak på — den svarer på om tiltakene virker.', 'Årshjulet gjør begge deler automatisk, med verneombudet varslet først.'],
      sci: 'Årlig grunnlinje kombinert med korte pulser gir bedre datakvalitet enn hyppige lange målinger. Svartretthet slår merkbart inn etter rundt åtte spørsmål.'
    },
    resultater: {
      title: 'Slik leser du resultatet',
      steps: ['Start med «Gjør disse tre». De er rangert etter effekt på helheten, ikke etter lavest tall.', 'Trykk på en faktorrad for å se de tre påstandene og fordelingen bak tallet.', '«Vurder risiko» gjør funnet om til et tiltak med eier og frist.'],
      sci: 'Prioriteringen er en driveranalyse: hvor sterkt hver faktor samvarierer med helhetsvurderingen hos nettopp dere. Bygger på jobbkrav–ressurser-modellen (Bakker og Demerouti).'
    },
    kommentarer: {
      title: 'Slik håndterer du samtaler',
      steps: ['Svar selv om du ikke har en løsning. «Jeg har lest dette» er nok.', 'Er saken alvorlig, kan du be om direkte kontakt. Personen velger selv om hen vil skrive til deg.', 'Lukk samtalen når dere er ferdige, så den ikke ligger og teller som ubesvart.'],
      sci: 'Å få svar på en anonym kommentar er den enkeltfaktoren som best forutsier om folk skriver igjen ved neste måling.'
    },
    tiltak: {
      title: 'Slik driver du tiltak i mål',
      steps: ['Hvert tiltak skal ha én navngitt eier. Delt ansvar er ikke ansvar.', 'Velg kollektive tiltak før individuelle — endre arbeidet, ikke folkene.', 'Et tiltak kan ikke lukkes før effekten er målt i neste puls.'],
      sci: 'Arbeidstilsynet og STAMI peker begge på at tiltak rettet mot organisering av arbeidet virker bedre enn individrettede tiltak. Kollektive tiltak skal vurderes først.'
    },
    articles: [{
      cat: 'Resultater',
      min: 4,
      title: 'Les indeksen riktig'
    }, {
      cat: 'Tiltak',
      min: 5,
      title: 'Fra funn til tiltak'
    }, {
      cat: 'Kom i gang',
      min: 6,
      title: 'De første 60 minuttene'
    }],
    setup: [{
      label: 'Legg inn de ansatte',
      done: true
    }, {
      label: 'Sjekk grupper og terskel',
      done: true
    }, {
      label: 'Slå på årshjulet',
      done: true
    }, {
      label: 'Gjennomfør første måling',
      done: true
    }]
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/data.js", error: String((e && e.message) || e) }); }

// ui_kits/app/main.jsx
try { (() => {
// App router for the Orgpuls app UI kit: screens, Enkel/Full view, top/side layout, the help panel.
const D = window.OP_DATA;
function Oppsett() {
  const [tab, setTab] = React.useState('Selskap');
  return /*#__PURE__*/React.createElement("main", {
    className: "animate-entry",
    style: {
      margin: '0 auto',
      maxWidth: 'var(--page-w, 1180px)',
      padding: '30px 28px 60px'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 32,
      fontWeight: 600,
      lineHeight: 1.1
    }
  }, "Oppsett"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '9px 0 0',
      maxWidth: 560,
      fontSize: 14.5,
      lineHeight: 1.6,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, "Hvem som jobber her, hvordan de er gruppert, hvem som ser hva \u2014 og hva loven krever at dere kan svare for. Har dere ikke HR-system, legger dere inn folk her."), /*#__PURE__*/React.createElement(window.Tabs, {
    tabs: ['Selskap', 'Ansatte', 'Grupper', 'Roller og tilgang', 'Regelverk', 'Personvern', 'Databehandleravtale', 'Abonnement'],
    value: tab,
    onChange: setTab
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      borderRadius: 18,
      border: '1px dashed var(--op-rule)',
      background: 'var(--op-sf)',
      padding: '34px 26px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600
    }
  }, tab, " er ikke gjenskapt i UI-kitet"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 5,
      fontSize: 13,
      color: 'var(--op-mut)'
    }
  }, "Se components/oppsett/*.tsx i kildekoden \u2014 fanene bruker Section, RadioCard, CheckRow og Field fra komponentbiblioteket.")));
}
function App() {
  const read = (k, d) => {
    try {
      return window.localStorage.getItem('orgpuls-kit:' + k) || d;
    } catch (e) {
      return d;
    }
  };
  const [screen, setScreenState] = React.useState(() => (location.hash || '').replace('#', '') || read('screen', 'innsikt'));
  const [view, setViewState] = React.useState(() => read('view', 'full'));
  const [side, setSideState] = React.useState(() => read('layout', 'top') === 'side');
  const [rail, setRail] = React.useState(true);
  const [panel, setPanel] = React.useState(null);
  const save = (k, v) => {
    try {
      window.localStorage.setItem('orgpuls-kit:' + k, v);
    } catch (e) {}
  };
  const go = k => {
    setScreenState(k);
    setPanel(null);
    save('screen', k);
    history.replaceState(null, '', '#' + k);
    window.scrollTo(0, 0);
  };
  const setView = v => {
    setViewState(v);
    save('view', v);
    if (v === 'enkel' && !['innsikt', 'oppsett'].includes(screen)) go('innsikt');
  };
  const setSide = s => {
    setSideState(s);
    save('layout', s ? 'side' : 'top');
  };
  React.useEffect(() => {
    const onHash = () => {
      const k = (location.hash || '').replace('#', '');
      if (k && k !== screen) setScreenState(k);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });
  const S = {
    innsikt: view === 'enkel' ? window.Oversikt : window.Innsikt,
    malinger: window.Malinger,
    resultater: window.Resultater,
    kommentarer: window.Kommentarer,
    tiltak: window.Tiltak,
    oppsett: Oppsett
  };
  const Screen = S[screen] || window.Innsikt;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      minHeight: '100vh',
      alignItems: 'stretch',
      '--page-w': side ? 'none' : '1180px',
      '--overview-w': side ? '1040px' : '880px'
    }
  }, side ? /*#__PURE__*/React.createElement(window.SideRail, {
    screen: screen,
    view: view,
    go: go,
    open: rail,
    setOpen: setRail,
    panel: panel,
    setPanel: setPanel
  }) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      minWidth: 0,
      flex: 1,
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(window.AppHeader, {
    screen: screen,
    view: view,
    setView: setView,
    side: side,
    setSide: setSide,
    panel: panel,
    setPanel: setPanel,
    go: go
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Screen, {
    key: screen + view,
    go: go
  })), /*#__PURE__*/React.createElement(window.AppFooter, {
    go: go
  })));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/main.jsx", error: String((e && e.message) || e) }); }

// ui_kits/respond/Respond.jsx
try { (() => {
// The respondent flow — transcribed from components/respond/RespondFlow.tsx + ChoiceGroup.tsx. A factor's three statements share a page (P1-4).
const DS = window.OrgpulsDesignSystem_d91c81;
const {
  ChoiceOption,
  Meter,
  Textarea,
  Tick,
  StatusPill
} = DS;
const D = window.OP_DATA;
const SCALE = ['Helt uenig', 'Litt uenig', 'Verken eller', 'Litt enig', 'Helt enig'];
const PROMISES = ['Svaret er anonymt. Navn, e-post og IP lagres ikke sammen med det du svarer.', 'Lederen din ser tall først når minst 5 i gruppa har svart.', 'Du kan hoppe over spørsmål, og du kan svare på mobil i pausa.', 'Skriver du en kommentar, kan lederen svare deg uten å få vite hvem du er.'];
// the pages: three factors from the instrument (the real order is shuffled per token), then the whole-organisation count question
const PAGES = [...['ytring', 'mengde', 'leder'].map(k => {
  const f = D.factors.find(x => x.key === k);
  return {
    kind: 'factor',
    label: f.name,
    qs: f.statements.map((s, i) => ({
      id: k + i,
      text: s
    }))
  };
}), {
  kind: 'count',
  label: 'Helhet',
  lead: 'Et kort spørsmål som bare telles for hele virksomheten',
  qs: [{
    id: 'anbefale',
    text: 'Jeg ville anbefalt arbeidsplassen min til en venn'
  }]
}];
const TOTAL = PAGES.reduce((n, p) => n + p.qs.length, 0);
const minutes = q => Math.max(1, Math.ceil(q * 7 / 60));
const KEY = 'orgpuls-kit:respond';
function Head() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '13px 20px 6px',
      fontSize: 11.5,
      fontWeight: 600,
      color: 'var(--op-mut)'
    }
  }, /*#__PURE__*/React.createElement("span", null, D.org.name, " AS"), /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Spr\xE5k",
    style: {
      display: 'flex',
      gap: 2,
      margin: '-4px 0'
    }
  }, [['Norsk', true], ['English', false], ['Polski', false]].map(([n, on]) => /*#__PURE__*/React.createElement("a", {
    key: n,
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      borderRadius: 999,
      padding: '4px 9px',
      fontSize: 11.5,
      textDecoration: 'none',
      background: on ? 'var(--op-sbg)' : 'transparent',
      fontWeight: on ? 700 : 600,
      color: on ? 'var(--op-ink)' : 'var(--op-mut)'
    }
  }, n))));
}
function Respond() {
  const saved = (() => {
    try {
      return JSON.parse(window.localStorage.getItem(KEY) || 'null');
    } catch (e) {
      return null;
    }
  })();
  const [page, setPage] = React.useState(saved ? saved.page : -1);
  const [picked, setPicked] = React.useState(saved ? saved.picked : {});
  const [comment, setComment] = React.useState({});
  const [text, setText] = React.useState({});
  const [done, setDone] = React.useState(false);
  const [restored, setRestored] = React.useState(!!saved && Object.keys(saved.picked || {}).length > 0);
  React.useEffect(() => {
    try {
      if (done) window.localStorage.removeItem(KEY);else if (page >= 0) window.localStorage.setItem(KEY, JSON.stringify({
        page,
        picked
      }));
    } catch (e) {}
  }, [page, picked, done]);
  const go = to => {
    setPage(to);
    setRestored(false);
    window.scrollTo(0, 0);
  };
  const cur = page >= 0 ? PAGES[page] : null;
  const isLast = page === PAGES.length - 1;
  const answeredBefore = PAGES.slice(0, Math.max(0, page)).reduce((n, p) => n + p.qs.length, 0);
  const advance = () => isLast ? setDone(true) : go(page + 1);
  const skip = () => {
    const ids = new Set(cur.qs.map(q => q.id));
    setPicked(Object.fromEntries(Object.entries(picked).filter(([k]) => !ids.has(k))));
    advance();
  };
  const dark = {
    height: 46,
    cursor: 'pointer',
    borderRadius: 14,
    border: '1px solid var(--op-ink)',
    background: 'var(--op-ink)',
    padding: '0 26px',
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--op-bg)',
    fontFamily: 'inherit'
  };
  if (done) return /*#__PURE__*/React.createElement("div", {
    className: "sheet animate-entry"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '34px 22px 24px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      display: 'flex',
      height: 64,
      width: 64,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      background: 'var(--op-mint)',
      fontSize: 30,
      color: 'var(--op-greendeep)'
    }
  }, "\u2713"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18,
      fontFamily: 'var(--font-display)',
      fontSize: 26,
      fontWeight: 500,
      lineHeight: 1.2,
      textWrap: 'balance'
    }
  }, "Takk for svarene dine"), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '12px auto 0',
      display: 'flex',
      maxWidth: 330,
      flexDirection: 'column',
      gap: 8,
      fontSize: 13.5,
      lineHeight: 1.6,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0
    }
  }, "Resultatene deles med alle 1. mars."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0
    }
  }, "Daglig leder og verneombud ser de samme tallene samtidig."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0
    }
  }, "Ingen kan se hva du svarte p\xE5 sp\xF8rsm\xE5lene, og ingen grupper vises med f\xE6rre enn 5 svar. Kommentarer kan leses av ledelsen, uten navn."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0
    }
  }, "Etterp\xE5 velges tiltak ut fra svarene, og du f\xE5r se hva som blir gjort.")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      setDone(false);
      setPicked({});
      setComment({});
      setText({});
      go(-1);
    },
    style: {
      marginTop: 22,
      cursor: 'pointer',
      border: 'none',
      background: 'transparent',
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--op-mut)',
      fontFamily: 'inherit',
      textDecoration: 'underline'
    }
  }, "Start forh\xE5ndsvisningen p\xE5 nytt")));
  if (page < 0) return /*#__PURE__*/React.createElement("div", {
    className: "sheet animate-entry"
  }, /*#__PURE__*/React.createElement("div", {
    role: "note",
    style: {
      background: 'var(--op-sbg)',
      padding: '10px 20px',
      fontSize: 12.5,
      fontWeight: 600,
      lineHeight: 1.45
    }
  }, "Forh\xE5ndsvisning \u2014 slik ser m\xE5lingen ut for de ansatte. Ingenting sendes."), /*#__PURE__*/React.createElement(Head, null), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 22px 22px'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 26,
      fontWeight: 500,
      lineHeight: 1.2,
      textWrap: 'balance'
    }
  }, "F\xF8r du starter"), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: '16px 0 0',
      display: 'flex',
      listStyle: 'none',
      flexDirection: 'column',
      gap: 10,
      padding: 0
    }
  }, PROMISES.map(p => /*#__PURE__*/React.createElement("li", {
    key: p,
    style: {
      display: 'flex',
      gap: 10,
      fontSize: 14,
      lineHeight: 1.5,
      textWrap: 'pretty'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement(Tick, {
    size: 20,
    round: true
  })), /*#__PURE__*/React.createElement("span", null, p)))), /*#__PURE__*/React.createElement("section", {
    "aria-labelledby": "since",
    style: {
      marginTop: 20,
      borderRadius: 12,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: '14px 16px'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    id: "since",
    style: {
      margin: 0,
      fontSize: 12,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: 'var(--op-mut)'
    }
  }, "Siden sist"), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: '10px 0 0',
      display: 'flex',
      listStyle: 'none',
      flexDirection: 'column',
      gap: 9,
      padding: 0
    }
  }, [['Faste én-til-én-samtaler hver fjerde uke', true], ['Ukentlig prioriteringsmøte på 15 minutter', true], ['Svar på hver melding innen fem dager', false]].map(([t, ok]) => /*#__PURE__*/React.createElement("li", {
    key: t,
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
      fontSize: 13.5,
      lineHeight: 1.45
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0
    }
  }, t), /*#__PURE__*/React.createElement(StatusPill, {
    tone: ok ? 'done' : 'apen',
    size: "small",
    style: ok ? undefined : {
      color: 'var(--op-ink)'
    }
  }, ok ? 'Gjennomført' : 'Pågår')))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 0',
      fontSize: 12,
      lineHeight: 1.5,
      color: 'var(--op-mut)'
    }
  }, "Dette er tiltak dere har jobbet med siden m\xE5lingen i februar.")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--op-mut)'
    }
  }, "Ca. ", minutes(TOTAL), " min igjen"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    autoFocus: true,
    onClick: () => go(0),
    style: {
      ...dark,
      marginTop: 18,
      width: '100%'
    }
  }, "Start"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      textAlign: 'center',
      fontSize: 11.5,
      color: 'var(--op-mut)'
    }
  }, "Du kan svare med tallene 1\u20135 og g\xE5 videre med Enter.")));
  const pct = Math.round((page + 1) / PAGES.length * 100);
  return /*#__PURE__*/React.createElement("div", {
    className: "sheet"
  }, /*#__PURE__*/React.createElement(Head, null), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 22px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Meter, {
    pct: pct,
    height: 5,
    color: "var(--op-ac)",
    track: "rgba(25,21,16,.1)",
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 'none',
      fontSize: 11.5,
      fontWeight: 600,
      color: 'var(--op-mut)'
    }
  }, page + 1, " / ", PAGES.length)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      textAlign: 'right',
      fontSize: 11,
      color: 'var(--op-mut)'
    },
    "aria-live": "polite"
  }, "Ca. ", minutes(TOTAL - answeredBefore), " min igjen")), restored ? /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      margin: '10px 22px 0',
      borderRadius: 10,
      background: 'var(--op-mint)',
      padding: '9px 12px',
      fontSize: 12.5,
      lineHeight: 1.45
    }
  }, "Vi fant svarene du begynte p\xE5, og du kan fortsette der du slapp. Det du skrev med egne ord, lagres ikke underveis.") : null, /*#__PURE__*/React.createElement("div", {
    key: page,
    className: "animate-entry",
    style: {
      padding: '18px 22px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-block',
      borderRadius: 999,
      background: 'var(--op-sbg)',
      padding: '4px 11px',
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em'
    }
  }, cur.label), cur.kind === 'factor' && cur.label === 'Ytringsklima' ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      fontSize: 13,
      lineHeight: 1.5,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, "Sp\xF8rres fordi dere jobber med: Svar p\xE5 hver melding innen fem dager (startet 1. mars)") : null, cur.lead ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      fontSize: 13,
      fontWeight: 600,
      lineHeight: 1.5,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, cur.lead) : null, cur.qs.map((q, i) => /*#__PURE__*/React.createElement("fieldset", {
    key: q.id,
    style: {
      margin: 0,
      minWidth: 0,
      border: 0,
      padding: 0,
      marginTop: i > 0 ? 26 : 0,
      borderTop: i > 0 ? '1px solid var(--op-line)' : 'none',
      paddingTop: i > 0 ? 20 : 0
    }
  }, /*#__PURE__*/React.createElement("legend", {
    id: 'q' + q.id,
    style: {
      padding: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      lineHeight: 1.27,
      textWrap: 'pretty',
      marginTop: cur.qs.length > 1 ? 12 : 14,
      fontSize: cur.qs.length > 1 ? 20 : 24
    }
  }, q.text), /*#__PURE__*/React.createElement("div", {
    role: "radiogroup",
    "aria-labelledby": 'q' + q.id,
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 9
    }
  }, SCALE.map((l, n) => /*#__PURE__*/React.createElement(ChoiceOption, {
    key: l,
    label: l,
    on: picked[q.id] === n + 1,
    onClick: () => setPicked({
      ...picked,
      [q.id]: n + 1
    })
  }))), cur.kind === 'factor' ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement(ChoiceOption, {
    label: "Ikke relevant for meg",
    muted: true,
    on: picked[q.id] === 0,
    onClick: () => setPicked({
      ...picked,
      [q.id]: 0
    })
  })) : null), cur.kind === 'factor' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-expanded": !!comment[q.id],
    onClick: () => setComment({
      ...comment,
      [q.id]: !comment[q.id]
    }),
    style: {
      marginTop: 12,
      display: 'flex',
      width: '100%',
      cursor: 'pointer',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      borderRadius: 14,
      border: '1px dashed var(--op-rule)',
      background: 'transparent',
      padding: '13px 16px',
      textAlign: 'left',
      color: 'var(--op-ink)',
      fontFamily: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13.5,
      color: 'var(--op-mut)'
    }
  }, "Vil du si mer? Frivillig og anonymt"), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      fontSize: 17,
      lineHeight: 1,
      color: 'var(--op-mut)'
    }
  }, comment[q.id] ? '−' : '+')), comment[q.id] ? /*#__PURE__*/React.createElement(Textarea, {
    size: "comment",
    value: text[q.id] || '',
    onChange: e => setText({
      ...text,
      [q.id]: e.target.value
    }),
    placeholder: "Skriv her \u2026",
    "aria-label": "Vil du si mer? Frivillig og anonymt",
    style: {
      marginTop: 9
    }
  }) : null) : null))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      borderTop: '1px solid var(--op-line)',
      padding: '14px 22px 22px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }
  }, page > 0 ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => go(page - 1),
    style: {
      cursor: 'pointer',
      border: 'none',
      background: 'transparent',
      padding: '8px 0',
      fontSize: 13.5,
      fontWeight: 600,
      color: 'var(--op-ink)',
      fontFamily: 'inherit'
    }
  }, "\u2190 Tilbake") : null, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: skip,
    style: {
      cursor: 'pointer',
      border: 'none',
      background: 'transparent',
      padding: '8px 0',
      fontSize: 13.5,
      fontWeight: 600,
      color: 'var(--op-mut)',
      fontFamily: 'inherit'
    }
  }, "Hopp over")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: advance,
    style: dark
  }, isLast ? 'Send inn' : 'Neste')));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(Respond, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/respond/Respond.jsx", error: String((e && e.message) || e) }); }

// ui_kits/site/Pages.jsx
try { (() => {
// Orgpuls public site — Forside (app/(marketing)/page.tsx), Priser, Logg inn (components/start/SignInPanel.tsx), Bransjer.
const DS = window.OrgpulsDesignSystem_d91c81;
const {
  Tick,
  Eyebrow,
  Input,
  Field
} = DS;
const col = {
  margin: '0 auto',
  maxWidth: 1120,
  padding: '0 26px'
};
const stop = fn => e => {
  e.preventDefault();
  fn && fn();
};
const h2 = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 32,
  fontWeight: 600,
  lineHeight: 1.14,
  textWrap: 'balance'
};
const ROLES = [{
  i: 'DL',
  t: 'Daglig leder',
  s: 'Uten HR-avdeling',
  bg: 'var(--op-sf)',
  get: ['Én side: hva står bra til, hva gjør vi nå', 'Rapport til ledelsen på to sider', 'Lovkravet dekket uten å lese paragrafer'],
  cta: 'Se for daglig leder'
}, {
  i: 'HR',
  t: 'HR',
  s: '75–500 ansatte',
  bg: 'var(--op-sbg)',
  get: ['Resultat per avdeling, team og segment', 'Utvikling over år, måling for måling', 'Roller og tilgang styrt fra ett sted'],
  cta: 'Se for HR'
}, {
  i: 'AL',
  t: 'Avdelingsleder',
  s: 'Eget team',
  bg: 'var(--op-sf)',
  get: ['Bare ditt team, over terskelen', 'Anonyme kommentarer du kan svare på', 'Tre forslag til tiltak, klare til å velge'],
  cta: 'Se for avdelingsleder'
}, {
  i: 'VO',
  t: 'Verneombud',
  s: 'Og tillitsvalgte',
  bg: 'var(--op-mint)',
  get: ['Samme tall som ledelsen, samtidig', 'Varsel før hver utsending', 'Risikovurderingen med hjemmel per faktor'],
  cta: 'Se for verneombud'
}];
const TEASERS = [{
  k: 'Plattform',
  t: 'Fire deler som henger sammen',
  d: 'Målinger, resultater, kommentarer og tiltak i én sløyfe. Bygget på et fast spørsmålssett og en terskel som aldri går under fem svar.',
  cta: 'Se plattformen',
  bg: 'var(--op-sf)',
  go: 'plattform'
}, {
  k: 'Bruksområder',
  t: 'Åtte situasjoner der Orgpuls gjør jobben lettere',
  d: 'Fra årlig kartlegging og puls til ny leder, omorganisering, tilsyn og AMU-møtet.',
  cta: 'Se bruksområdene',
  bg: 'var(--op-sbg)',
  go: 'bruksomrader'
}, {
  k: 'Hvorfor Orgpuls',
  t: 'Kontinuerlig oppfølging skaper resultater på sikt',
  d: 'Positivt fokus, tiltak med eier og frist, og loven dekket underveis. Med kilder.',
  cta: 'Les hvorfor',
  bg: 'var(--op-sf)',
  go: 'hvorfor'
}];
const INDUSTRIES = [{
  k: 'Bygg, anlegg og verksted',
  t: 'Bygg og anlegg',
  d: 'Sikkerhet under tidspress, mange firma på samme plass, språk på laget, nye og unge, og om det er rom for å si at man ikke har det bra.',
  cta: 'Se bygg og anlegg'
}, {
  k: 'Helse, omsorg og arbeid med mennesker',
  t: 'Helse og omsorg',
  d: 'Vold og trusler, bemanning og forsvarlig omsorg, turnus og deltid, grenser mot brukere og pårørende, dokumentasjon og tunge forflytninger.',
  cta: 'Se helse og omsorg'
}, {
  k: 'Barnehage, skole og SFO',
  t: 'Barnehage og skole',
  d: 'Vold og trusler, bemanning og vikarer, foreldresamarbeid, tilrettelegging og tid til kjerneoppgavene.',
  cta: 'Se barnehage og skole',
  isNew: true
}, {
  k: 'Rådgivning, IT, finans, media og eiendom',
  t: 'Kunnskap og kontor',
  d: 'Avbrytelser og møter, tilgjengelighet utenom arbeidstid, hybridarbeid og KI. Forenklet eller utvidet.',
  cta: 'Se kunnskap og kontor'
}, {
  k: 'Butikk, lager og netthandel',
  t: 'Handel',
  d: 'Tyveri og trusler, alenevakter, krevende kunder, vaktplan og deltid.',
  cta: 'Se handel',
  isNew: true
}];
function IndustryCards({
  go
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      display: 'grid',
      gap: 13,
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))'
    }
  }, INDUSTRIES.map((x, i) => /*#__PURE__*/React.createElement("a", {
    key: x.t,
    href: "#bransjer",
    onClick: stop(() => go('bransjer')),
    style: {
      display: 'flex',
      minHeight: 180,
      flexDirection: 'column',
      gap: 10,
      borderRadius: 20,
      border: '1px solid var(--op-line)',
      padding: 24,
      color: 'var(--op-ink)',
      textDecoration: 'none',
      background: i % 2 ? 'var(--op-mint)' : 'var(--op-sbg)',
      boxSizing: 'border-box'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    variant: "site"
  }, x.k), x.isNew ? /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 'none',
      borderRadius: 999,
      background: 'var(--op-ac)',
      padding: '2px 9px',
      fontSize: 11,
      fontWeight: 700
    }
  }, "Ny") : null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 24,
      fontWeight: 600,
      lineHeight: 1.15,
      textWrap: 'balance'
    }
  }, x.t), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13.5,
      lineHeight: 1.55,
      color: 'var(--op-body)',
      textWrap: 'pretty'
    }
  }, x.d), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 'auto',
      fontSize: 13.5,
      fontWeight: 700,
      color: 'var(--op-link)'
    }
  }, x.cta, " \u2192"))));
}
function Forside({
  go
}) {
  const cta = {
    display: 'flex',
    height: 50,
    alignItems: 'center',
    borderRadius: 13,
    border: '1px solid var(--op-ink)',
    fontSize: 16,
    color: 'var(--op-ink)',
    textDecoration: 'none'
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("section", {
    id: "topp",
    style: {
      ...col,
      paddingTop: 60
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 780
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      borderRadius: 999,
      background: 'var(--op-sbg)',
      padding: '6px 13px',
      fontSize: 12,
      fontWeight: 700
    }
  }, "Medarbeiderunders\xF8kelse og arbeidsmilj\xF8"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '19px 0 0',
      fontFamily: 'var(--font-display)',
      fontSize: 56,
      fontWeight: 600,
      lineHeight: 1.04,
      textWrap: 'balance'
    }
  }, "F\xF8rste m\xE5ling ute f\xF8r lunsj."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '17px 0 0',
      maxWidth: '54ch',
      fontSize: 17.5,
      lineHeight: 1.65,
      color: 'var(--op-body)',
      textWrap: 'pretty'
    }
  }, "Hent virksomheten fra Br\xF8nn\xF8ysund, lim inn ansattlista, velg dato. Orgpuls sender ut, minner p\xE5 og varsler verneombudet. Resultatet kommer med forslag til tiltak \u2014 og hver rolle f\xE5r sin egen vei inn."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 26,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#kom-i-gang",
    style: {
      ...cta,
      background: 'var(--op-ac)',
      padding: '0 24px',
      fontWeight: 700
    }
  }, "Pr\xF8v gratis i 15 dager"), /*#__PURE__*/React.createElement("a", {
    href: "#plattform",
    onClick: stop(() => go('plattform')),
    style: {
      ...cta,
      padding: '0 22px',
      fontWeight: 600
    }
  }, "Se hvordan det virker")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 26,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 24
    }
  }, [['20 min', 'fra org.nr. til første utsending'], ['4 min', 'å svare på hovedundersøkelsen'], ['5 svar', 'minste antall før en gruppe vises']].map(([v, l]) => /*#__PURE__*/React.createElement("span", {
    key: v
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-display)',
      fontSize: 28,
      fontWeight: 600,
      lineHeight: 1
    }
  }, v), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 4,
      display: 'block',
      fontSize: 12.5,
      color: 'var(--op-mut)'
    }
  }, l))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 44
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    variant: "site"
  }, "Hvem er du?"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      display: 'grid',
      gap: 13,
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))'
    }
  }, ROLES.map(r => /*#__PURE__*/React.createElement("a", {
    key: r.i,
    href: "#plattform",
    onClick: stop(() => go('plattform')),
    style: {
      display: 'flex',
      minHeight: 290,
      flexDirection: 'column',
      gap: 12,
      borderRadius: 20,
      border: '1px solid var(--op-line)',
      padding: '22px 20px',
      color: 'var(--op-ink)',
      textDecoration: 'none',
      background: r.bg,
      boxSizing: 'border-box'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      height: 44,
      width: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 13,
      background: 'var(--op-ink)',
      fontFamily: 'var(--font-display)',
      fontSize: 19,
      fontWeight: 600,
      color: 'var(--op-bg)'
    }
  }, r.i), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 18,
      fontWeight: 700
    }
  }, r.t), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 3,
      display: 'block',
      fontSize: 13,
      color: 'var(--op-mut)'
    }
  }, r.s)), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flex: 1,
      flexDirection: 'column',
      gap: 7
    }
  }, r.get.map(g => /*#__PURE__*/React.createElement("span", {
    key: g,
    style: {
      display: 'flex',
      gap: 8,
      fontSize: 13.5,
      lineHeight: 1.45,
      textWrap: 'pretty'
    }
  }, /*#__PURE__*/React.createElement(Tick, {
    size: 16
  }), g))), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 11,
      border: '1px solid var(--op-ink)',
      background: 'var(--op-sf)',
      fontSize: 13.5,
      fontWeight: 700
    }
  }, r.cta)))))), /*#__PURE__*/React.createElement("section", {
    style: {
      ...col,
      paddingTop: 80
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    variant: "site"
  }, "Utforsk"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      display: 'grid',
      gap: 13,
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))'
    }
  }, TEASERS.map(x => /*#__PURE__*/React.createElement("a", {
    key: x.k,
    href: '#' + x.go,
    onClick: stop(() => go(x.go)),
    style: {
      display: 'flex',
      minHeight: 220,
      flexDirection: 'column',
      gap: 10,
      borderRadius: 20,
      border: '1px solid var(--op-line)',
      padding: 24,
      color: 'var(--op-ink)',
      textDecoration: 'none',
      background: x.bg,
      boxSizing: 'border-box'
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    variant: "site"
  }, x.k), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 24,
      fontWeight: 600,
      lineHeight: 1.15,
      textWrap: 'balance'
    }
  }, x.t), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13.5,
      lineHeight: 1.55,
      color: 'var(--op-body)',
      textWrap: 'pretty'
    }
  }, x.d), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 'auto',
      fontSize: 13.5,
      fontWeight: 700,
      color: 'var(--op-link)'
    }
  }, x.cta, " \u2192"))))), /*#__PURE__*/React.createElement("section", {
    id: "bransjer",
    style: {
      ...col,
      paddingTop: 56
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    variant: "site"
  }, "Bransjer"), /*#__PURE__*/React.createElement("a", {
    href: "#bransjer",
    onClick: stop(() => go('bransjer')),
    style: {
      fontSize: 13.5,
      fontWeight: 700
    }
  }, "Alle bransjer \u2192")), /*#__PURE__*/React.createElement(IndustryCards, {
    go: go
  })), /*#__PURE__*/React.createElement("section", {
    id: "om-oss",
    style: {
      ...col,
      display: 'grid',
      alignItems: 'center',
      gap: 36,
      paddingTop: 80,
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Eyebrow, {
    variant: "site"
  }, "Om oss"), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '9px 0 0',
      fontFamily: 'var(--font-display)',
      fontSize: 36,
      fontWeight: 600,
      lineHeight: 1.12,
      textWrap: 'balance'
    }
  }, "Sm\xE5 team, korte veier"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '13px 0 0',
      maxWidth: '50ch',
      fontSize: 15,
      lineHeight: 1.7,
      color: 'var(--op-body)',
      textWrap: 'pretty'
    }
  }, "Orgpuls lages av et lite norsk team med bakgrunn fra HR, ledelse og produktutvikling. Du snakker med de som bygger produktet, ikke et supportsenter. Data lagres i EU, og vi selger dem ikke videre.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 12
    }
  }, [['av1', 'Produkt', 'HR og ledelse'], ['av2', 'Fag', 'Arbeidsmiljø og forskning'], ['av3', 'Kunder', 'Oppstart og support']].map(([src, n, r]) => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      borderRadius: 16,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: 16,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: '../../assets/tuva/' + src + '.png',
    alt: "",
    width: "64",
    height: "64",
    style: {
      display: 'inline',
      height: 64,
      width: 64,
      borderRadius: 18,
      background: 'var(--op-bg)',
      objectFit: 'cover',
      verticalAlign: 'baseline'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 10,
      display: 'block',
      fontSize: 14,
      fontWeight: 700
    }
  }, n), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 2,
      display: 'block',
      fontSize: 12,
      color: 'var(--op-mut)'
    }
  }, r))))), /*#__PURE__*/React.createElement("section", {
    id: "pris",
    style: {
      ...col,
      marginTop: 80
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 26,
      borderRadius: 22,
      background: 'var(--op-ink)',
      padding: '30px 36px',
      color: 'var(--op-bg)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      opacity: .65
    }
  }, "Pris"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 6,
      display: 'block',
      fontFamily: 'var(--font-display)',
      fontSize: 28,
      fontWeight: 600,
      textWrap: 'balance'
    }
  }, "Fra 265 kr i m\xE5neden. Alt inkludert."), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 6,
      display: 'block',
      fontSize: 14,
      opacity: .75
    }
  }, "565 kr for 26\u2013100 ansatte. Ingen bindingstid. Verneombud og tillitsvalgte koster ikke ekstra.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flex: 'none',
      flexWrap: 'wrap',
      gap: 9
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#pris",
    onClick: stop(() => go('pris')),
    style: {
      display: 'flex',
      height: 50,
      alignItems: 'center',
      borderRadius: 13,
      border: '1px solid rgba(252,246,233,.35)',
      padding: '0 22px',
      fontSize: 15,
      fontWeight: 600,
      color: 'var(--op-bg)',
      textDecoration: 'none'
    }
  }, "Se prisene"), /*#__PURE__*/React.createElement("a", {
    href: "#kom-i-gang",
    style: {
      display: 'flex',
      height: 50,
      alignItems: 'center',
      borderRadius: 13,
      background: 'var(--op-ac)',
      padding: '0 24px',
      fontSize: 16,
      fontWeight: 700,
      color: 'var(--op-ink)',
      textDecoration: 'none'
    }
  }, "Kom i gang gratis")))), /*#__PURE__*/React.createElement(window.StartBand, null));
}
function Priser({
  go
}) {
  const faq = [['Er svarene virkelig anonyme?', 'Ja. Vi lagrer aldri navn, e-postadresse eller IP-adresse sammen med svaret — det finnes ingen kolonne som kunne holdt koblingen. Og ingen gruppe vises før minst fem personer har svart.'], ['Hva om vi bare er tolv personer?', 'Da får dere tall for hele virksomheten, men ikke brutt ned på avdeling. Med tolv ansatte er en avdeling på tre personer gjenkjennelig.'], ['Hvor mye tid tar det for oss?', 'Oppsettet tar under en time første gang. Deretter planlegger årshjulet rundene selv. De ansatte bruker fire minutter på den årlige kartleggingen og under ett minutt på en puls.'], ['Hva skjer med dataene hvis vi slutter å bruke Orgpuls?', 'Dere eier dem. Last ned alt som PDF når som helst, også etter en oppsigelse. Sier dere opp, sletter vi svarene etter 30 dager.']];
  const [open, setOpen] = React.useState(0);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("section", {
    style: {
      ...col,
      paddingTop: 44
    }
  }, /*#__PURE__*/React.createElement(window.Crumbs, {
    page: "Pris"
  }), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '14px 0 0',
      maxWidth: '20ch',
      fontFamily: 'var(--font-display)',
      fontSize: 44,
      fontWeight: 600,
      lineHeight: 1.08,
      textWrap: 'balance'
    }
  }, "Fra 265 kr i m\xE5neden. Alt inkludert."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '14px 0 0',
      maxWidth: '54ch',
      fontSize: 16,
      lineHeight: 1.65,
      color: 'var(--op-body)',
      textWrap: 'pretty'
    }
  }, "Ingen bindingstid. Verneombud og tillitsvalgte koster ikke ekstra. Gratis i 15 dager, uten kort."), /*#__PURE__*/React.createElement(window.Plans, {
    go: go
  })), /*#__PURE__*/React.createElement("section", {
    style: {
      ...col,
      paddingTop: 64
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    variant: "site"
  }, "Sp\xF8rsm\xE5l vi f\xE5r ofte"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 9,
      maxWidth: 760
    }
  }, faq.map(([q, a], i) => /*#__PURE__*/React.createElement("div", {
    key: q,
    style: {
      borderRadius: 16,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-expanded": open === i,
    onClick: () => setOpen(open === i ? -1 : i),
    style: {
      display: 'flex',
      width: '100%',
      cursor: 'pointer',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      border: 'none',
      background: 'transparent',
      padding: '16px 20px',
      textAlign: 'left',
      fontSize: 15.5,
      fontWeight: 700,
      color: 'var(--op-ink)',
      fontFamily: 'inherit'
    }
  }, q, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      fontSize: 18,
      lineHeight: 1,
      color: 'var(--op-mut)'
    }
  }, open === i ? '−' : '+')), open === i ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      padding: '0 20px 18px',
      fontSize: 14.5,
      lineHeight: 1.65,
      color: 'var(--op-body)',
      textWrap: 'pretty'
    }
  }, a) : null)))), /*#__PURE__*/React.createElement(window.StartBand, null));
}
function LoggInn({
  go
}) {
  const [mode, setMode] = React.useState('signin');
  const field = {
    height: 48,
    width: '100%',
    borderRadius: 12,
    border: '1.5px solid var(--op-line)',
    background: 'var(--op-bg)',
    padding: '0 15px',
    fontSize: 15,
    color: 'var(--op-ink)',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit'
  };
  const submit = {
    marginTop: 14,
    display: 'inline-flex',
    height: 48,
    width: '100%',
    cursor: 'pointer',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    border: '1px solid var(--op-ink)',
    background: 'var(--op-ac)',
    fontSize: 15.5,
    fontWeight: 700,
    color: 'var(--op-ink)',
    fontFamily: 'inherit'
  };
  const link = {
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    padding: 0,
    fontSize: 12.5,
    fontWeight: 600,
    color: 'var(--op-link)',
    textDecoration: 'underline',
    fontFamily: 'inherit'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...col,
      display: 'grid',
      alignItems: 'start',
      gap: 36,
      padding: '54px 26px 0',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 20,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: 32,
      maxWidth: 520
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      borderRadius: 999,
      background: 'var(--op-sbg)',
      padding: '5px 12px',
      fontSize: 11.5,
      fontWeight: 700
    }
  }, "For deg som administrerer"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '13px 0 0',
      fontFamily: 'var(--font-display)',
      fontSize: 31,
      fontWeight: 600,
      lineHeight: 1.12
    }
  }, mode === 'forgot' ? 'Glemt passord' : 'Logg inn'), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 0',
      maxWidth: '42ch',
      fontSize: 14,
      lineHeight: 1.6,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, mode === 'forgot' ? 'Skriv inn e-postadressen din, så sender vi en lenke for å sette et nytt passord.' : 'Her logger du inn hvis du skal sette opp målinger, se resultater eller følge opp tiltak.'), /*#__PURE__*/React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      if (mode === 'signin') go('app');else setMode('sent');
    }
  }, mode === 'sent' ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      borderRadius: 15,
      background: 'var(--op-mint)',
      padding: '20px 22px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 15,
      fontWeight: 700,
      color: 'var(--op-greendeep)'
    }
  }, "Lenke for nytt passord er sendt"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 6,
      display: 'block',
      fontSize: 13.5,
      lineHeight: 1.6,
      color: 'var(--op-greendeep)',
      textWrap: 'pretty'
    }
  }, "Finnes det en konto p\xE5 adressen, ligger lenken i innboksen. Den varer i kort tid, s\xE5 bruk den med \xE9n gang.")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("label", {
    style: {
      marginTop: 20,
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      marginBottom: 7,
      display: 'block',
      fontSize: 13,
      fontWeight: 700
    }
  }, "E-post p\xE5 jobben"), /*#__PURE__*/React.createElement("input", {
    type: "email",
    required: true,
    placeholder: "navn@virksomhet.no",
    style: field
  })), mode === 'signin' ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      marginBottom: 7,
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("label", {
    htmlFor: "pw",
    style: {
      fontSize: 13,
      fontWeight: 700
    }
  }, "Passord"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setMode('forgot'),
    style: link
  }, "Glemt passord?")), /*#__PURE__*/React.createElement("input", {
    id: "pw",
    type: "password",
    required: true,
    minLength: 8,
    placeholder: "Passordet ditt",
    style: field
  })) : null, /*#__PURE__*/React.createElement("button", {
    type: "submit",
    style: submit
  }, mode === 'signin' ? 'Logg inn' : 'Send lenke'), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 9,
      fontSize: 12.5,
      lineHeight: 1.5,
      color: 'var(--op-mut)',
      textWrap: 'pretty'
    }
  }, mode === 'signin' ? 'Bruk adressen du ble registrert med. Har du glemt passordet, sender vi en lenke.' : null))), mode !== 'signin' ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setMode('signin'),
    style: {
      ...link,
      marginTop: 12,
      display: 'block',
      fontSize: 13
    }
  }, "Tilbake til innlogging") : null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 22,
      borderTop: '1px solid var(--op-line)',
      paddingTop: 18,
      fontSize: 13,
      color: 'var(--op-mut)'
    }
  }, "Har dere ikke konto enn\xE5? ", /*#__PURE__*/React.createElement("a", {
    href: "#registrer",
    onClick: stop(() => go('registrer'))
  }, "Kom i gang gratis"), ".")), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 420,
      paddingTop: 10
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    variant: "site"
  }, "Skal du svare p\xE5 en m\xE5ling?"), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '9px 0 0',
      ...h2
    }
  }, "Da trenger du ingen konto"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '12px 0 0',
      fontSize: 15,
      lineHeight: 1.65,
      color: 'var(--op-body)',
      textWrap: 'pretty'
    }
  }, "Lenken i e-posten eller SMS-en tar deg rett til sp\xF8rsm\xE5lene. Svaret ditt lagres uten kobling til navn, e-post eller nummer."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18,
      borderRadius: 16,
      background: 'var(--op-sbg)',
      padding: '16px 18px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 14,
      fontWeight: 700
    }
  }, "F\xE5r du ikke lenken?"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 5,
      display: 'block',
      fontSize: 13,
      lineHeight: 1.55,
      color: 'var(--op-body)',
      textWrap: 'pretty'
    }
  }, "Se i s\xF8ppelposten f\xF8rst. Er du fortsatt l\xE5st ute, skriv til hjelp@orgpuls.no \u2014 oppgi navn og hvilken virksomhet du jobber i."))));
}
function Bransjer({
  go
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("section", {
    style: {
      ...col,
      paddingTop: 44
    }
  }, /*#__PURE__*/React.createElement(window.Crumbs, {
    page: "Bransjer"
  }), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '14px 0 0',
      maxWidth: '22ch',
      fontFamily: 'var(--font-display)',
      fontSize: 44,
      fontWeight: 600,
      lineHeight: 1.08,
      textWrap: 'balance'
    }
  }, "Samme lov, ulik hverdag"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '14px 0 0',
      maxWidth: '54ch',
      fontSize: 16,
      lineHeight: 1.65,
      color: 'var(--op-body)',
      textWrap: 'pretty'
    }
  }, "Hovedunders\xF8kelsen er den samme for alle. Bransjemodulene legger til faktorene bransjen har egne krav om \u2014 og de er av som standard."), /*#__PURE__*/React.createElement(IndustryCards, {
    go: go
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 13,
      borderRadius: 20,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: 24,
      maxWidth: 560
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    variant: "site"
  }, "Andre bransjer"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 0',
      fontSize: 13.5,
      lineHeight: 1.55,
      color: 'var(--op-body)',
      textWrap: 'pretty'
    }
  }, "Kravene til kartlegging er de samme for alle, og hovedunders\xF8kelsen dekker dem. Se ", /*#__PURE__*/React.createElement("a", {
    href: "#bruksomrader",
    onClick: stop(() => go('bruksomrader'))
  }, "bruksomr\xE5dene"), " for sider etter behov, rolle og st\xF8rrelse."))), /*#__PURE__*/React.createElement(window.StartBand, null));
}
function Placeholder({
  page,
  go
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("section", {
    style: {
      ...col,
      paddingTop: 44
    }
  }, /*#__PURE__*/React.createElement(window.Crumbs, {
    page: page
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      borderRadius: 20,
      border: '1px dashed var(--op-rule)',
      background: 'var(--op-sf)',
      padding: '40px 26px',
      textAlign: 'center',
      maxWidth: 760
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600
    }
  }, "\xAB", page, "\xBB er ikke gjenskapt i UI-kitet"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 5,
      fontSize: 13,
      color: 'var(--op-mut)'
    }
  }, "Siden bygges av CMS-blokker (components/marketing/Blocks.tsx) \u2014 h2, prose, ticked points, law rows, cards, plans, product shots. Se Forside for m\xF8nstrene."))), /*#__PURE__*/React.createElement(window.StartBand, null));
}
Object.assign(window, {
  Forside,
  Priser,
  LoggInn,
  Bransjer,
  Placeholder
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/site/Pages.jsx", error: String((e && e.message) || e) }); }

// ui_kits/site/SiteShell.jsx
try { (() => {
// Orgpuls public site — chrome and pages, transcribed from app/(marketing)/layout.tsx, page.tsx, components/site/*, components/marketing/*.
const DS = window.OrgpulsDesignSystem_d91c81;
const {
  Logo,
  Tick,
  Eyebrow,
  Button,
  Input,
  Field,
  Pill
} = DS;
const SITE_NAV = [['plattform', 'Plattform'], ['bruksomrader', 'Bruksområder'], ['bransjer', 'Bransjer'], ['hvorfor', 'Hvorfor Orgpuls'], ['pris', 'Pris']];
const col = {
  margin: '0 auto',
  maxWidth: 1120,
  padding: '0 26px'
};
const stop = fn => e => {
  e.preventDefault();
  fn && fn();
};
function SiteHeader({
  page,
  go
}) {
  const [open, setOpen] = React.useState(false);
  const at = k => page === k || k === 'bransjer' && page === 'bransje';
  const btn = {
    display: 'flex',
    height: 38,
    alignItems: 'center',
    borderRadius: 10,
    padding: '0 17px',
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--op-ink)',
    textDecoration: 'none',
    border: '1px solid var(--op-ink)'
  };
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 40,
      borderBottom: '1px solid var(--op-line)',
      background: 'var(--op-sf)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...col,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 22,
      padding: '13px 26px'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#forside",
    onClick: stop(() => go('forside')),
    style: {
      display: 'flex',
      flex: 'none',
      alignItems: 'center',
      gap: 10,
      color: 'var(--op-ink)',
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    size: 33,
    wordmark: 21,
    radius: 10
  })), /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Hovedmeny",
    style: {
      display: 'flex',
      minWidth: 0,
      flex: 1,
      flexWrap: 'wrap',
      gap: 4
    }
  }, SITE_NAV.map(([k, l]) => k === 'bransjer' ? /*#__PURE__*/React.createElement("span", {
    key: k,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-expanded": open,
    onClick: () => setOpen(!open),
    style: {
      display: 'inline-flex',
      cursor: 'pointer',
      alignItems: 'center',
      gap: 6,
      borderRadius: 9,
      border: 'none',
      padding: '8px 12px',
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--op-ink)',
      fontFamily: 'inherit',
      background: at(k) || open ? 'var(--op-sbg)' : 'transparent'
    }
  }, l, /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "10",
    viewBox: "0 0 10 10",
    fill: "none",
    "aria-hidden": "true",
    style: {
      transform: open ? 'rotate(180deg)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 3.5l3 3 3-3",
    stroke: "#191510",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), open ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      top: 'calc(100% + 8px)',
      zIndex: 50,
      display: 'flex',
      width: 240,
      flexDirection: 'column',
      gap: 2,
      borderRadius: 18,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: 8,
      boxShadow: 'var(--shadow-menu)'
    }
  }, ['Alle bransjer', 'Bygg og anlegg', 'Helse og omsorg', 'Barnehage og skole', 'Kunnskap og kontor', 'Handel'].map((x, i) => /*#__PURE__*/React.createElement("a", {
    key: x,
    href: "#",
    onClick: stop(() => {
      setOpen(false);
      go('bransjer');
    }),
    style: {
      display: 'flex',
      height: 38,
      alignItems: 'center',
      borderRadius: 10,
      padding: '0 12px',
      fontSize: 13.5,
      fontWeight: 600,
      color: 'var(--op-ink)',
      textDecoration: 'none',
      background: i === 0 && at('bransjer') ? 'var(--op-sbg)' : 'transparent'
    }
  }, x))) : null) : /*#__PURE__*/React.createElement("a", {
    key: k,
    href: '#' + k,
    "aria-current": at(k) ? 'page' : undefined,
    onClick: stop(() => go(k)),
    style: {
      borderRadius: 9,
      padding: '8px 12px',
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--op-ink)',
      textDecoration: 'none',
      background: at(k) ? 'var(--op-sbg)' : 'transparent'
    }
  }, l))), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flex: 'none',
      alignItems: 'center',
      gap: 9
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-label": "Spr\xE5k",
    style: {
      display: 'flex',
      gap: 2,
      marginRight: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      borderRadius: 999,
      padding: '5px 10px',
      fontSize: 12.5,
      fontWeight: 700,
      background: 'var(--op-sbg)'
    }
  }, "Norsk"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: stop(),
    style: {
      borderRadius: 999,
      padding: '5px 10px',
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--op-mut)',
      textDecoration: 'none'
    }
  }, "English")), /*#__PURE__*/React.createElement("a", {
    href: "#logg-inn",
    onClick: stop(() => go('logg-inn')),
    style: {
      display: 'flex',
      height: 38,
      alignItems: 'center',
      borderRadius: 10,
      padding: '0 15px',
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--op-ink)',
      textDecoration: 'none'
    }
  }, "Logg inn"), /*#__PURE__*/React.createElement("a", {
    href: "#demo",
    onClick: stop(),
    style: {
      ...btn,
      background: 'var(--op-sf)'
    }
  }, "Se demo"), /*#__PURE__*/React.createElement("a", {
    href: "#registrer",
    onClick: stop(() => go('registrer')),
    style: {
      ...btn,
      background: 'var(--op-ac)'
    }
  }, "Kom i gang"))));
}
function StartBand() {
  const [v, setV] = React.useState('');
  const [note, setNote] = React.useState(null);
  return /*#__PURE__*/React.createElement("section", {
    id: "kom-i-gang",
    style: {
      ...col,
      marginTop: 64,
      paddingBottom: 72
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      alignItems: 'center',
      gap: 26,
      borderRadius: 24,
      border: '1px solid var(--op-line)',
      background: 'var(--op-sf)',
      padding: '36px 40px',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      maxWidth: '22ch',
      fontFamily: 'var(--font-display)',
      fontSize: 32,
      fontWeight: 600,
      lineHeight: 1.14,
      textWrap: 'balance'
    }
  }, "Pr\xF8v det p\xE5 deres egen virksomhet"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '12px 0 0',
      maxWidth: '48ch',
      fontSize: 15,
      lineHeight: 1.65,
      color: 'var(--op-body)',
      textWrap: 'pretty'
    }
  }, "Skriv inn organisasjonsnummeret, s\xE5 henter vi navn, adresse og bransje fra Br\xF8nn\xF8ysundregistrene. Gratis i 15 dager. Ingen kort.")), /*#__PURE__*/React.createElement("form", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 9
    },
    onSubmit: e => {
      e.preventDefault();
      const d = v.replace(/\D/g, '');
      setNote(d.length === 9 ? {
        ok: true,
        text: 'Vi henter ' + d.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') + ' fra Brønnøysundregistrene …'
      } : {
        ok: false,
        text: 'Et organisasjonsnummer har ni sifre.'
      });
    }
  }, /*#__PURE__*/React.createElement(Input, {
    size: "site",
    value: v,
    onChange: e => {
      setV(e.target.value);
      setNote(null);
    },
    inputMode: "numeric",
    placeholder: "Organisasjonsnummer",
    "aria-label": "Organisasjonsnummer",
    style: {
      minWidth: 200,
      flex: 1,
      width: 'auto'
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    style: {
      height: 52,
      cursor: 'pointer',
      borderRadius: 13,
      border: '1px solid var(--op-ink)',
      background: 'var(--op-ac)',
      padding: '0 22px',
      fontSize: 16,
      fontWeight: 700,
      color: 'var(--op-ink)',
      fontFamily: 'inherit'
    }
  }, "Kom i gang"), note ? /*#__PURE__*/React.createElement("span", {
    role: note.ok ? 'status' : 'alert',
    style: {
      flexBasis: '100%',
      fontSize: 13,
      lineHeight: 1.5,
      color: note.ok ? 'var(--op-link)' : 'var(--op-danger)'
    }
  }, note.text) : null)));
}
function SiteFooter({
  go
}) {
  const cols = [['Produkt', ['Plattform', 'Målinger og årshjul', 'Resultater', 'Kommentarer', 'Tiltak', 'Pris']], ['Bruksområder', ['Arbeidsmiljøkartlegging', 'Medarbeiderundersøkelse', 'Pulsmålinger', 'Rapport til Arbeidstilsynet', 'Verneombud og AMU']], ['Ressurser', ['Slik virker det', 'Arbeidsmiljøloven forklart', 'Spørsmålssettet', 'Personvern og anonymitet', 'Ofte stilte spørsmål']], ['Om oss', ['Hvorfor Orgpuls', 'Kontakt', 'Personvernerklæring', 'Vilkår']]];
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      borderTop: '1px solid var(--op-line)',
      background: 'var(--op-sf)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...col,
      display: 'grid',
      gap: 24,
      padding: '36px 26px',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 19,
      fontWeight: 600
    }
  }, "Orgpuls"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 0',
      maxWidth: '26ch',
      fontSize: 12.5,
      lineHeight: 1.6,
      color: 'var(--op-mut)'
    }
  }, "Medarbeiderunders\xF8kelse og arbeidsmilj\xF8kartlegging for norske virksomheter. Data lagres i EU.")), cols.map(([h, links]) => /*#__PURE__*/React.createElement("nav", {
    key: h,
    "aria-label": h
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      color: 'var(--op-mut)'
    }
  }, h), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    onClick: stop(() => l === 'Pris' ? go('pris') : null),
    style: {
      fontSize: 13,
      color: 'var(--op-ink)',
      textDecoration: 'none'
    }
  }, l)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      ...col,
      paddingBottom: 22,
      fontSize: 11.5,
      color: 'var(--op-mut)'
    }
  }, "\xA9 2026 Orgpuls \xB7 ", /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: stop(),
    style: {
      color: 'inherit'
    }
  }, "Personvern"), " \xB7 Vilk\xE5r"));
}
function Crumbs({
  page
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Du er her",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12.5,
      color: 'var(--op-mut)'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#forside",
    onClick: stop(),
    style: {
      color: 'var(--op-mut)',
      textDecoration: 'none'
    }
  }, "Orgpuls"), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, "\u203A"), /*#__PURE__*/React.createElement("span", {
    "aria-current": "page",
    style: {
      fontWeight: 600,
      color: 'var(--op-ink)'
    }
  }, page)), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 18,
      display: 'inline-block',
      borderRadius: 999,
      background: 'var(--op-sbg)',
      padding: '6px 13px',
      fontSize: 12,
      fontWeight: 700
    }
  }, page));
}
function Plans({
  go
}) {
  const plans = [{
    name: 'Liten',
    who: 'Til og med 25 ansatte',
    price: '265 kr',
    unit: 'per måned',
    cta: 'Start gratis',
    items: ['Årlig kartlegging og puls mellom', 'Rapport klar til Arbeidstilsynet', 'Ubegrenset antall tiltak', 'Utsending på e-post og SMS']
  }, {
    name: 'Vanlig',
    who: '26 til 100 ansatte',
    price: '565 kr',
    unit: 'per måned',
    cta: 'Start gratis',
    accent: true,
    items: ['Alt i Liten', 'Resultat per avdeling og team', 'Anonyme samtaler med de ansatte', 'Utvikling over tid, måling for måling']
  }, {
    name: 'Flere selskaper',
    who: 'Konsern og over 100 ansatte',
    price: 'Etter avtale',
    unit: '',
    cta: 'Snakk med oss',
    items: ['Alt i Vanlig', 'Felles oversikt på tvers av selskaper', 'Egen kontaktperson', 'Hjelp til første utsending']
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 22,
      display: 'grid',
      alignItems: 'start',
      gap: 13,
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(272px, 100%), 1fr))'
    }
  }, plans.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.name,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      borderRadius: 19,
      padding: 26,
      border: p.accent ? '2px solid var(--op-ink)' : '1px solid var(--op-line)',
      background: p.accent ? 'var(--op-sbg)' : 'var(--op-sf)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16.5,
      fontWeight: 700
    }
  }, p.name), p.accent ? /*#__PURE__*/React.createElement("span", {
    style: {
      borderRadius: 999,
      background: 'var(--op-ac)',
      padding: '4px 11px',
      fontSize: 11,
      fontWeight: 700
    }
  }, "Anbefalt") : null), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 12.5,
      color: 'var(--op-mut)'
    }
  }, p.who), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 38,
      fontWeight: 600,
      lineHeight: 1
    }
  }, p.price), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--op-mut)'
    }
  }, p.unit)), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 4,
      display: 'flex',
      flexDirection: 'column',
      gap: 7
    }
  }, p.items.map(i => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 9
    }
  }, /*#__PURE__*/React.createElement(Tick, {
    size: 16
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      lineHeight: 1.5,
      textWrap: 'pretty'
    }
  }, i)))), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: stop(() => go(p.cta === 'Snakk med oss' ? 'kontakt' : 'registrer')),
    style: {
      marginTop: 8,
      display: 'inline-flex',
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      border: '1px solid var(--op-ink)',
      fontSize: 14.5,
      fontWeight: 700,
      color: 'var(--op-ink)',
      textDecoration: 'none',
      background: p.accent ? 'var(--op-ac)' : 'transparent'
    }
  }, p.cta))));
}
Object.assign(window, {
  SiteHeader,
  SiteFooter,
  StartBand,
  Crumbs,
  Plans,
  SITE_NAV
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/site/SiteShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/site/main.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const PAGES = {
  forside: 'Forside',
  plattform: 'Plattform',
  bruksomrader: 'Bruksområder',
  bransjer: 'Bransjer',
  hvorfor: 'Hvorfor Orgpuls',
  pris: 'Pris',
  'logg-inn': 'Logg inn',
  registrer: 'Kom i gang',
  kontakt: 'Kontakt'
};
function SiteApp() {
  const [page, setPage] = React.useState(() => {
    const h = (location.hash || '').replace('#', '');
    return PAGES[h] ? h : 'forside';
  });
  const go = k => {
    if (k === 'app') {
      window.location.href = '../app/index.html';
      return;
    }
    if (!PAGES[k]) k = 'forside';
    setPage(k);
    history.replaceState(null, '', '#' + k);
    window.scrollTo(0, 0);
  };
  const Page = page === 'forside' ? window.Forside : page === 'pris' ? window.Priser : page === 'logg-inn' ? window.LoggInn : page === 'bransjer' ? window.Bransjer : p => /*#__PURE__*/React.createElement(window.Placeholder, _extends({
    page: PAGES[page]
  }, p));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      background: 'var(--op-bg)',
      fontSize: 14,
      color: 'var(--op-ink)'
    }
  }, /*#__PURE__*/React.createElement(window.SiteHeader, {
    page: page,
    go: go
  }), /*#__PURE__*/React.createElement("main", {
    key: page,
    className: "animate-entry"
  }, /*#__PURE__*/React.createElement(Page, {
    go: go
  })), /*#__PURE__*/React.createElement(window.SiteFooter, {
    go: go
  }));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(SiteApp, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/site/main.jsx", error: String((e && e.message) || e) }); }

__ds_ns.AccountChip = __ds_scope.AccountChip;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.CountBadge = __ds_scope.CountBadge;

__ds_ns.Eyebrow = __ds_scope.Eyebrow;

__ds_ns.ICON_PATHS = __ds_scope.ICON_PATHS;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.Pill = __ds_scope.Pill;

__ds_ns.Segmented = __ds_scope.Segmented;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Tick = __ds_scope.Tick;

__ds_ns.HeatTone = __ds_scope.HeatTone;

__ds_ns.HeatTile = __ds_scope.HeatTile;

__ds_ns.MaskedCell = __ds_scope.MaskedCell;

__ds_ns.Meter = __ds_scope.Meter;

__ds_ns.RateColour = __ds_scope.RateColour;

__ds_ns.BAND_LABEL = __ds_scope.BAND_LABEL;

__ds_ns.BAND_BAR = __ds_scope.BAND_BAR;

__ds_ns.RiskBadge = __ds_scope.RiskBadge;

__ds_ns.StackedBar = __ds_scope.StackedBar;

__ds_ns.StatusPill = __ds_scope.StatusPill;

__ds_ns.TypePill = __ds_scope.TypePill;

__ds_ns.CheckCard = __ds_scope.CheckCard;

__ds_ns.CheckRow = __ds_scope.CheckRow;

__ds_ns.ChoiceOption = __ds_scope.ChoiceOption;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.FIELD_SIZE = __ds_scope.FIELD_SIZE;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Mark = __ds_scope.Mark;

__ds_ns.RadioCard = __ds_scope.RadioCard;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.NoteCard = __ds_scope.NoteCard;

__ds_ns.Row = __ds_scope.Row;

__ds_ns.Section = __ds_scope.Section;

})();
