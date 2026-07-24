import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      throw new Error("Method not allowed");
    }

    // Autenticar al usuario
    const { user, serviceClient } = await authenticate(req);
    const userId = user.id;

    if (!userId) {
      throw new Error("Invalid user identity");
    }

    console.log(`Starting account deletion for user: ${userId}`);

    // Borramos manualmente TODAS las tablas que guardan datos del usuario,
    // en orden de hijo -> padre (no asumimos ON DELETE CASCADE: el schema
    // real no lo garantiza para estas tablas, asi que si borraramos en el
    // orden equivocado una FK podria rechazar el delete).
    //
    // IMPORTANTE: cada paso se revisa por error. Si algo falla, se aborta
    // ANTES de tocar auth.users -- asi nunca queda una cuenta que "ya no
    // existe" (no puede volver a entrar) pero con toda su plata y su
    // historial todavia en la base de datos.

    // 1. income_event_logs no tiene user_id propio -- depende de
    //    pending_income_events.id. Buscamos esos ids primero.
    const { data: pendingEvents, error: peSelectError } = await serviceClient
      .from('pending_income_events')
      .select('id')
      .eq('user_id', userId);

    if (peSelectError) {
      throw new Error(`No se pudo leer pending_income_events: ${peSelectError.message}`);
    }

    const pendingEventIds = (pendingEvents ?? []).map((e: { id: string }) => e.id);

    if (pendingEventIds.length > 0) {
      const { error } = await serviceClient
        .from('income_event_logs')
        .delete()
        .in('event_id', pendingEventIds);
      if (error) throw new Error(`Fallo borrando income_event_logs: ${error.message}`);
    }

    // 2. pending_income_events (depende de income_sources y transactions)
    {
      const { error } = await serviceClient.from('pending_income_events').delete().eq('user_id', userId);
      if (error) throw new Error(`Fallo borrando pending_income_events: ${error.message}`);
    }

    // 3. transactions (depende de user_budget_cycles via cycle_id)
    {
      const { error } = await serviceClient.from('transactions').delete().eq('user_id', userId);
      if (error) throw new Error(`Fallo borrando transactions: ${error.message}`);
    }

    // 4. income_sources
    {
      const { error } = await serviceClient.from('income_sources').delete().eq('user_id', userId);
      if (error) throw new Error(`Fallo borrando income_sources: ${error.message}`);
    }

    // 5. pockets
    {
      const { error } = await serviceClient.from('pockets').delete().eq('user_id', userId);
      if (error) throw new Error(`Fallo borrando pockets: ${error.message}`);
    }

    // 6. user_budget_cycles (el nombre real de la tabla -- NO "cycles")
    {
      const { error } = await serviceClient.from('user_budget_cycles').delete().eq('user_id', userId);
      if (error) throw new Error(`Fallo borrando user_budget_cycles: ${error.message}`);
    }

    // 7. chat_messages
    {
      const { error } = await serviceClient.from('chat_messages').delete().eq('user_id', userId);
      if (error) throw new Error(`Fallo borrando chat_messages: ${error.message}`);
    }

    // 8. user_events
    {
      const { error } = await serviceClient.from('user_events').delete().eq('user_id', userId);
      if (error) throw new Error(`Fallo borrando user_events: ${error.message}`);
    }

    // 9. user_spending_rules
    {
      const { error } = await serviceClient.from('user_spending_rules').delete().eq('user_id', userId);
      if (error) throw new Error(`Fallo borrando user_spending_rules: ${error.message}`);
    }

    // 10. user_memory
    {
      const { error } = await serviceClient.from('user_memory').delete().eq('user_id', userId);
      if (error) throw new Error(`Fallo borrando user_memory: ${error.message}`);
    }

    // 11. user_insights
    {
      const { error } = await serviceClient.from('user_insights').delete().eq('user_id', userId);
      if (error) throw new Error(`Fallo borrando user_insights: ${error.message}`);
    }

    // 12. monthly_closures
    {
      const { error } = await serviceClient.from('monthly_closures').delete().eq('user_id', userId);
      if (error) throw new Error(`Fallo borrando monthly_closures: ${error.message}`);
    }

    // 13. profiles (depende de auth.users)
    {
      const { error } = await serviceClient.from('profiles').delete().eq('id', userId);
      if (error) throw new Error(`Fallo borrando profiles: ${error.message}`);
    }

    // 14. Eliminar el usuario de Supabase Auth -- SIEMPRE al final, y solo si
    //     todo lo anterior salio bien. Esto requiere el service_role key,
    //     que authenticate() ya nos provee.
    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("Error deleting user from auth:", deleteError);
      throw new Error(`Se borraron los datos pero fallo el borrado de la cuenta de acceso: ${deleteError.message}`);
    }

    console.log(`Successfully deleted account and data for user: ${userId}`);

    return new Response(JSON.stringify({ success: true, message: "Account deleted successfully" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error in delete-account function:", error);

    const status = error instanceof Error && error.message.includes("Method not allowed") ? 405 : 400;

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
});
