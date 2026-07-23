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

    // Borramos datos del usuario en cascada manualmente para asegurarnos, 
    // en caso de que la DB no tenga configurado ON DELETE CASCADE en estas tablas.
    
    // 1. Borrar transacciones
    await serviceClient.from('transactions').delete().eq('user_id', userId);
    
    // 2. Borrar bolsillos
    await serviceClient.from('pockets').delete().eq('user_id', userId);
    
    // 3. Borrar ciclos (historial)
    await serviceClient.from('cycles').delete().eq('user_id', userId);
    
    // 4. Borrar perfil de usuario
    await serviceClient.from('profiles').delete().eq('id', userId);

    // 5. Eliminar el usuario de Supabase Auth
    // Importante: Esto requiere el service_role key, que authenticate() ya nos provee.
    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("Error deleting user from auth:", deleteError);
      throw new Error(`Failed to delete user: ${deleteError.message}`);
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
