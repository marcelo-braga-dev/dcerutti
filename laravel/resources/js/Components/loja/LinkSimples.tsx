import { Link } from '@inertiajs/react';
import { styled } from '@mui/material/styles';

/** Link do Inertia sem estilo de link, que aceita `sx` (o Box com `component={Link}` não tipa no MUI 9). */
export const LinkSimples = styled(Link)({ color: 'inherit', textDecoration: 'none' });
