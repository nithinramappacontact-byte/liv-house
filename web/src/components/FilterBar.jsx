import { Paper, Box, TextField, MenuItem, Button, Typography } from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { C } from '../theme';

const toLocalInput = (s) => (s ? s.replace(' ', 'T').slice(0, 16) : '');
const fromLocalInput = (s) => (s ? `${s.replace('T', ' ')}:00` : '');

export default function FilterBar({ meta, filters, onChange, onReset, extra }) {
  const set = (k) => (e) => onChange({ ...filters, [k]: e.target.value });

  const field = {
    size: 'small',
    sx: {
      minWidth: 158,
      '& .MuiInputBase-root': { bgcolor: C.ground, fontSize: 13 },
      '& .MuiInputLabel-root': { fontSize: 12.5 },
    },
  };

  return (
    <Paper elevation={0} sx={{ p: 1.75, bgcolor: C.surface }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="overline" sx={{ mr: 0.5 }}>Filters</Typography>

        <TextField
          {...field} label="From" type="datetime-local"
          InputLabelProps={{ shrink: true }}
          value={toLocalInput(filters.from)}
          onChange={(e) => onChange({ ...filters, from: fromLocalInput(e.target.value) })}
        />
        <TextField
          {...field} label="To" type="datetime-local"
          InputLabelProps={{ shrink: true }}
          value={toLocalInput(filters.to)}
          onChange={(e) => onChange({ ...filters, to: fromLocalInput(e.target.value) })}
        />

        <TextField {...field} select label="Platform" value={filters.platform || ''} onChange={set('platform')}>
          <MenuItem value="">All platforms</MenuItem>
          {(meta?.platforms || []).map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
        </TextField>

        <TextField {...field} select label="Country" value={filters.country || ''} onChange={set('country')}>
          <MenuItem value="">All countries</MenuItem>
          {(meta?.countries || []).map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>

        <TextField {...field} select label="Content type" value={filters.video_type || ''} onChange={set('video_type')}>
          <MenuItem value="">All types</MenuItem>
          {(meta?.video_types || []).map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
        </TextField>

        {extra}

        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<RestartAltIcon sx={{ fontSize: 16 }} />} onClick={onReset}
          sx={{ color: C.muted, fontSize: 12.5, textTransform: 'none' }}>
          Reset
        </Button>
      </Box>
    </Paper>
  );
}
