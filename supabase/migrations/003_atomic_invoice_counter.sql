-- Atomic invoice-number reservation.
-- Swiss invoicing requires unique, sequential numbers per pilot per year.
-- The previous read-then-update in JS could race under concurrent /send
-- calls and emit duplicate numbers. This function does it in one statement
-- under a row lock, returning the reserved counter value.

create or replace function reserve_invoice_number(p_pilot uuid, p_year int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  -- Lock the pilot row for the duration of the transaction.
  perform 1 from pilots where id = p_pilot for update;

  update pilots
     set invoice_counter = case
           when invoice_counter_year = p_year then coalesce(invoice_counter, 0) + 1
           else 1
         end,
         invoice_counter_year = p_year
   where id = p_pilot
   returning invoice_counter into v_next;

  if v_next is null then
    raise exception 'pilot % not found', p_pilot;
  end if;

  return v_next;
end;
$$;

-- Only the service role calls this (from server routes); revoke from anon/auth.
revoke all on function reserve_invoice_number(uuid, int) from public;
revoke all on function reserve_invoice_number(uuid, int) from anon;
revoke all on function reserve_invoice_number(uuid, int) from authenticated;
