import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

export type EvidenceImage = {
  url: string;
  alt: string;
};

export type EvidenceGroup = {
  title: string;
  emptyLabel: string;
  items: EvidenceImage[];
  accent?: 'default' | 'success';
};

function fileLabel(alt: string): string {
  const parts = alt.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || alt;
}

function stepIndex(i: number, delta: number, n: number): number {
  if (n <= 0) return 0;
  return (i + delta + n) % n;
}

export function EvidenceGallery({
  groups,
  onViewerChange,
}: {
  groups: EvidenceGroup[];
  onViewerChange?: (open: boolean) => void;
}) {
  const flat = useMemo(() => {
    const out: Array<EvidenceImage & { groupTitle: string }> = [];
    for (const g of groups) {
      for (const item of g.items) {
        out.push({ ...item, groupTitle: g.title });
      }
    }
    return out;
  }, [groups]);

  const [viewer, setViewer] = useState<number | null>(null);

  useEffect(() => {
    onViewerChange?.(viewer != null);
  }, [viewer, onViewerChange]);

  useEffect(() => {
    return () => onViewerChange?.(false);
  }, [onViewerChange]);

  const flatIndex = useCallback(
    (groupIdx: number, itemIdx: number): number => {
      let n = 0;
      for (let i = 0; i < groupIdx; i++) n += groups[i]?.items.length ?? 0;
      return n + itemIdx;
    },
    [groups],
  );

  const moveViewer = useCallback(
    (delta: number) => {
      setViewer((cur) => {
        if (cur == null || !flat.length) return cur;
        return stepIndex(cur, delta, flat.length);
      });
    },
    [flat.length],
  );

  useEffect(() => {
    if (viewer == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        moveViewer(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        moveViewer(1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setViewer(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [viewer, moveViewer]);

  const current = viewer != null ? flat[viewer] : null;

  return (
    <Stack spacing={2}>
      {groups.map((group, gi) => {
        const items = group.items;
        const accentColor =
          group.accent === 'success' ? 'success.main' : 'divider';
        return (
          <Box key={group.title}>
            <Typography variant="subtitle2" gutterBottom>
              {group.title}
            </Typography>
            {items.length ? (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {items.map((item, ii) => (
                  <Box
                    key={item.url}
                    component="img"
                    src={item.url}
                    alt={item.alt}
                    onClick={() => setViewer(flatIndex(gi, ii))}
                    sx={{
                      width: 96,
                      height: 96,
                      objectFit: 'cover',
                      borderRadius: 1,
                      border: 1,
                      borderColor: accentColor,
                      cursor: 'zoom-in',
                    }}
                  />
                ))}
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary">
                {group.emptyLabel}
              </Typography>
            )}
          </Box>
        );
      })}

      {current && typeof document !== 'undefined'
        ? createPortal(
            <Box
              role="dialog"
              aria-modal="true"
              aria-label="Evidence gallery"
              onClick={() => setViewer(null)}
              sx={{
                position: 'fixed',
                inset: 0,
                zIndex: (t) => t.zIndex.modal + 2,
                bgcolor: 'rgba(0,0,0,0.88)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 2,
              }}
            >
              <Box
                onClick={(e) => e.stopPropagation()}
                sx={{
                  position: 'relative',
                  width: 'min(1100px, 100%)',
                  bgcolor: 'common.black',
                  borderRadius: 1,
                  minHeight: 240,
                }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{
                    position: 'absolute',
                    top: 8,
                    left: 12,
                    right: 8,
                    zIndex: 1,
                    color: 'common.white',
                  }}
                >
                  <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                    {current.groupTitle}
                    {' · '}
                    {viewer! + 1} / {flat.length}
                    {' · '}
                    {fileLabel(current.alt)}
                  </Typography>
                  <IconButton
                    aria-label="Close gallery"
                    onClick={() => setViewer(null)}
                    size="small"
                    sx={{ color: 'common.white' }}
                  >
                    <CloseIcon />
                  </IconButton>
                </Stack>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    px: 0.5,
                    pt: 5,
                    pb: 1,
                  }}
                >
                  <IconButton
                    aria-label="Previous evidence"
                    disabled={flat.length < 2}
                    onClick={() => moveViewer(-1)}
                    sx={{ color: 'common.white' }}
                  >
                    <ChevronLeftIcon />
                  </IconButton>
                  <Box
                    component="img"
                    src={current.url}
                    alt={current.alt}
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      maxHeight: '80vh',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                  <IconButton
                    aria-label="Next evidence"
                    disabled={flat.length < 2}
                    onClick={() => moveViewer(1)}
                    sx={{ color: 'common.white' }}
                  >
                    <ChevronRightIcon />
                  </IconButton>
                </Box>
              </Box>
            </Box>,
            document.body,
          )
        : null}
    </Stack>
  );
}
