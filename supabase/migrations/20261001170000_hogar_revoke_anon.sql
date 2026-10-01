-- Security Advisor: las funciones de «hogar» eran ejecutables por anon vía
-- /rest/v1/rpc. Sin sesión devolvían falso o vacío, pero no tienen por qué estar
-- abiertas. Las tres de RLS siguen para authenticated (las usan las policies de
-- gastos, ingresos, hogares, hogar_miembros y libros); el trigger no necesita
-- EXECUTE de nadie.
revoke execute on function public.es_titular(uuid)       from public, anon;
revoke execute on function public.libro_visible(uuid)    from public, anon;
revoke execute on function public.mis_hogares()          from public, anon;
grant execute on function public.es_titular(uuid)        to authenticated, service_role;
grant execute on function public.libro_visible(uuid)     to authenticated, service_role;
grant execute on function public.mis_hogares()           to authenticated, service_role;
revoke execute on function public.gastos_libro_default() from public, anon, authenticated;
