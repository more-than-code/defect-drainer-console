/** Adapted from mo-webadmin-next ErrorState. */
import Alert from '@mui/material/Alert';

export function ErrorState({ message }: { message: string }) {
  return <Alert severity="error">{message}</Alert>;
}
