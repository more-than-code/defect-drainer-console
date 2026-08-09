/** Aligned with mo-webadmin-next SearchField. */
import SearchIcon from '@mui/icons-material/Search';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { type KeyboardEvent, useEffect, useState } from 'react';

type SearchFieldProps = {
  label: string;
  value?: string;
  initialValue?: string;
  onSearch: (value: string) => void;
  /** Live update on change (defect list filters client-side). */
  live?: boolean;
  placeholder?: string;
  sx?: object;
};

export function SearchField({
  label,
  value: controlled,
  initialValue = '',
  onSearch,
  live = false,
  placeholder,
  sx,
}: SearchFieldProps) {
  const [value, setValue] = useState(controlled ?? initialValue);

  useEffect(() => {
    if (controlled !== undefined) setValue(controlled);
  }, [controlled]);

  const submit = () => onSearch(value.trim());
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') submit();
  };

  return (
    <TextField
      size="small"
      label={label}
      value={value}
      placeholder={placeholder}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        if (live) onSearch(next);
      }}
      onKeyDown={handleKeyDown}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton aria-label={label} edge="end" onClick={submit} size="small">
              <SearchIcon />
            </IconButton>
          </InputAdornment>
        ),
      }}
      sx={{ minWidth: 260, ...sx }}
    />
  );
}
