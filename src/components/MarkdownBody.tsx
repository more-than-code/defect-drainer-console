import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = {
  children: string;
  /** denser body text for nested/long content */
  dense?: boolean;
};

/**
 * Renders GFM markdown (tables, lists, headings) with MUI theme colors.
 * HTML is not enabled — safe for untrusted agent-written content.
 */
export function MarkdownBody({ children, dense }: Props) {
  const theme = useTheme();
  const fontSize = dense ? 13 : 14;

  return (
    <Box
      sx={{
        fontSize,
        lineHeight: 1.55,
        color: 'text.primary',
        wordBreak: 'break-word',
        '& > :first-child': { mt: 0 },
        '& > :last-child': { mb: 0 },
        '& h1, & h2, & h3, & h4, & h5, & h6': {
          mt: 1.75,
          mb: 0.75,
          fontWeight: 700,
          lineHeight: 1.3,
          color: 'text.primary',
        },
        '& h1': { fontSize: '1.25rem' },
        '& h2': { fontSize: '1.1rem' },
        '& h3': { fontSize: '1rem' },
        '& h4, & h5, & h6': { fontSize: '0.95rem' },
        '& p': { my: 0.75 },
        '& ul, & ol': {
          my: 0.75,
          pl: 2.5,
        },
        '& li': { my: 0.25 },
        '& li > p': { my: 0.25 },
        '& blockquote': {
          my: 1,
          pl: 1.5,
          borderLeft: 3,
          borderColor: 'divider',
          color: 'text.secondary',
        },
        '& code': {
          fontFamily: 'ui-monospace, Menlo, monospace',
          fontSize: '0.9em',
          px: 0.5,
          py: 0.15,
          borderRadius: 0.5,
          bgcolor:
            theme.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(0,0,0,0.06)',
        },
        '& pre': {
          my: 1,
          p: 1.25,
          overflow: 'auto',
          borderRadius: 1,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
          fontSize: dense ? 12 : 13,
        },
        '& pre code': {
          p: 0,
          bgcolor: 'transparent',
          fontSize: 'inherit',
        },
        '& a': {
          color: 'primary.main',
          textDecoration: 'underline',
          textUnderlineOffset: 2,
        },
        '& hr': {
          my: 1.5,
          border: 0,
          borderTop: 1,
          borderColor: 'divider',
        },
        '& table': {
          width: '100%',
          my: 1.25,
          borderCollapse: 'collapse',
          fontSize: dense ? 12.5 : 13,
        },
        '& th, & td': {
          border: 1,
          borderColor: 'divider',
          px: 1.25,
          py: 0.75,
          textAlign: 'left',
          verticalAlign: 'top',
        },
        '& th': {
          fontWeight: 700,
          bgcolor:
            theme.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.04)',
        },
        '& tr:nth-of-type(even) td': {
          bgcolor:
            theme.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.02)'
              : 'rgba(0,0,0,0.015)',
        },
        '& img': {
          maxWidth: '100%',
          height: 'auto',
          borderRadius: 1,
        },
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </Box>
  );
}
