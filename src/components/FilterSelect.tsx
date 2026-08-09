/** Filter dropdown pattern from mo-webadmin-next list pages (e.g. TasksPage). */
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';

type FilterSelectProps = {
  label: string;
  value: string;
  allLabel?: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  minWidth?: number;
};

export function FilterSelect({
  label,
  value,
  allLabel,
  options,
  onChange,
  minWidth = 140,
}: FilterSelectProps) {
  return (
    <FormControl size="small" sx={{ minWidth }}>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={value}
        onChange={(e) => onChange(String(e.target.value))}
      >
        {allLabel !== undefined ? (
          <MenuItem value="all">{allLabel}</MenuItem>
        ) : null}
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
