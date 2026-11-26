'use client';

// An adapter: the copied EchoSign React pages import Link, NavLink, useNavigate and friends from 'react-router-dom'.
// next.config.mjs points that name at THIS file, so those pages run unchanged under Next.js routing (next/navigation).
// It keeps the language in the address: a link to "/classroom" really goes to "/en/classroom".
import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo } from 'react';
import NextLink from 'next/link';
import { usePathname, useParams as useNextParams, useRouter, useSearchParams as useNextSearchParams } from 'next/navigation';

const LOCALES = ['en', 'hi', 'es'];

const splitLocale = (pathname = '/') => {
  const parts = pathname.split('/');
  if (LOCALES.includes(parts[1])) return { locale: parts[1], rest: `/${parts.slice(2).join('/')}` };
  return { locale: 'en', rest: pathname || '/' };
};

const toText = (to) => (typeof to === 'string' ? to : `${to?.pathname || ''}${to?.search || ''}${to?.hash || ''}`);

const withLocale = (to, locale) => {
  const text = toText(to);
  if (!text.startsWith('/') || text.startsWith('//')) return text; // relative, hash or external: leave it
  if (LOCALES.some((l) => text === `/${l}` || text.startsWith(`/${l}/`) || text.startsWith(`/${l}?`))) return text;
  return `/${locale}${text === '/' ? '' : text}`;
};

const useLocale = () => splitLocale(usePathname()).locale;

export const Link = forwardRef(function Link({ to, replace, state, reloadDocument, children, ...rest }, ref) {
  const locale = useLocale();
  return <NextLink ref={ref} href={withLocale(to, locale)} replace={replace} {...rest}>{children}</NextLink>;
});

export const NavLink = forwardRef(function NavLink({ to, end, className, children, ...rest }, ref) {
  const pathname = usePathname();
  const { locale, rest: here } = splitLocale(pathname);
  const target = toText(to).split('?')[0];
  const isActive = end ? here === target : here === target || here.startsWith(`${target}/`);
  const cls = typeof className === 'function' ? className({ isActive }) : className;
  return (
    <NextLink ref={ref} href={withLocale(to, locale)} className={cls} aria-current={isActive ? 'page' : undefined} {...rest}>
      {typeof children === 'function' ? children({ isActive }) : children}
    </NextLink>
  );
});

export function useNavigate() {
  const router = useRouter();
  const locale = useLocale();
  return useCallback((to, options = {}) => {
    if (typeof to === 'number') { if (to < 0) router.back(); else router.forward(); return; }
    const href = withLocale(to, locale);
    if (options.replace) router.replace(href); else router.push(href);
  }, [router, locale]);
}

export function Navigate({ to, replace }) {
  const navigate = useNavigate();
  useEffect(() => { navigate(to, { replace }); }, [navigate, to, replace]);
  return null;
}

// The address WITHOUT the language, the way the React code expects it ("/classroom/ABC123").
export function useLocation() {
  const pathname = usePathname();
  const search = useNextSearchParams();
  const { rest } = splitLocale(pathname);
  return useMemo(() => ({ pathname: rest, search: search?.toString() ? `?${search.toString()}` : '', hash: '', state: null, key: pathname }), [rest, search, pathname]);
}

export function useParams() {
  const { locale, ...params } = useNextParams() || {};
  return params;
}

export function useSearchParams() {
  const router = useRouter();
  const pathname = usePathname();
  const current = useNextSearchParams();
  const setSearchParams = useCallback((next, options = {}) => {
    const base = new URLSearchParams(current?.toString() || '');
    const value = typeof next === 'function' ? next(base) : next;
    const params = value instanceof URLSearchParams ? value : new URLSearchParams(value || {});
    const query = params.toString();
    const href = `${pathname}${query ? `?${query}` : ''}`;
    if (options.replace) router.replace(href); else router.push(href);
  }, [current, pathname, router]);
  return [useMemo(() => new URLSearchParams(current?.toString() || ''), [current]), setSearchParams];
}

// <Outlet /> shows the page of the layout it sits in. In Next.js the layout receives the page as `children`, so the
// layout hands it to <OutletProvider element={children}> and every <Outlet /> below shows it.
const OutletContext = createContext(null);
export const OutletProvider = ({ element, children }) => <OutletContext.Provider value={element}>{children}</OutletContext.Provider>;
export const Outlet = () => useContext(OutletContext);
