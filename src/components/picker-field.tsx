/** Label + swatch trigger row — shared layout for ColorPicker/IconPicker/BrandIconPicker
 * fields, so "Color" and "Icon" always line up the same way across every form. */
export function PickerField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium flex-1 min-w-0">{label}</label>
      {children}
    </div>
  );
}
