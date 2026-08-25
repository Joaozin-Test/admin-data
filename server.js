export default {
    async fetch(request, env) {
        const SUPABASE_URL = env.SUPABASE_URL;
        const SUPABASE_KEY = env.SUPABASE_KEY;

        const headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        };

        const url = new URL(request.url);
        const method = request.method;

        const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });

        const getBody = async () => { try { return await request.json(); } catch { return {}; } };

        const checkAdminKey = () => {
            const clientKey = request.headers.get("x-manox-key");
            return clientKey && clientKey === env.ADMIN_API_KEY;
        };

        const now = Date.now();

        // --- JOBID ---
        if (method === "POST" && url.pathname === "/api/manox/send-jobid") {
            const { username, placeId, jobId } = await getBody();
            if (!username || !placeId || !jobId) return jsonResponse({ error: "Dados incompletos." }, 400);

            await fetch(`${SUPABASE_URL}/rest/v1/player_sessions`, {
                method: "POST",
                headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
                body: JSON.stringify({ id: "current", username, place_id: String(placeId), job_id: String(jobId), timestamp: now })
            });

            return jsonResponse({ success: true, message: "Sessão salva no Supabase com sucesso!" });
        }

        if (method === "GET" && url.pathname === "/api/manox/get-jobid") {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/player_sessions?id=eq.current`, { headers });
            const data = await res.json();
            
            if (data && Array.isArray(data) && data.length > 0) {
                return jsonResponse({
                    username: data[0].username,
                    placeId: data[0].place_id,
                    jobId: data[0].job_id,
                    timestamp: data[0].timestamp
                });
            }

            return jsonResponse({ username: "Nenhum", placeId: null, jobId: null, timestamp: null });
        }

        // --- ROTA TUDO-EM-UM PARA O ROBLOX (TODAS AS CARGAS E PERMISSÕES) ---
        if (method === "GET" && url.pathname === "/api/manox/all-roles") {
            const [ownersRes, adminsRes, tempRes] = await Promise.all([
                fetch(`${SUPABASE_URL}/rest/v1/owners?select=username`, { headers }),
                fetch(`${SUPABASE_URL}/rest/v1/permanent_admins?select=username`, { headers }),
                fetch(`${SUPABASE_URL}/rest/v1/temp_admins?expires_at=gt.${now}&select=username,expires_at`, { headers })
            ]);

            const owners = await ownersRes.json();
            const admins = await adminsRes.json();
            const tempAdmins = await tempRes.json();

            return jsonResponse({
                success: true,
                owners: Array.isArray(owners) ? owners.map(o => o.username) : [],
                admins: Array.isArray(admins) ? admins.map(a => a.username) : [],
                tempAdmins: Array.isArray(tempAdmins) ? tempAdmins : []
            });
        }

        // --- ADMINS TEMPORÁRIOS ---
        if (method === "GET" && url.pathname === "/api/manox/temp-admins") {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/temp_admins?expires_at=gt.${now}`, { headers });
            const admins = await res.json();
            return jsonResponse({ success: true, admins: Array.isArray(admins) ? admins : [] });
        }

        if (method === "POST" && url.pathname === "/api/manox/temp-admins/add") {
            if (!checkAdminKey()) return jsonResponse({ success: false, message: "Não autorizado" }, 401);
            const { username, durationMinutes } = await getBody();
            if (!username) return jsonResponse({ success: false, message: "Username necessário" }, 400);

            // Tempo customizado em minutos (Padrão: 60 min)
            const minutes = durationMinutes && Number(durationMinutes) > 0 ? Number(durationMinutes) : 60;
            const expiresAt = now + (minutes * 60 * 1000);

            await fetch(`${SUPABASE_URL}/rest/v1/temp_admins`, {
                method: "POST",
                headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
                body: JSON.stringify({ username: username.trim(), expires_at: expiresAt })
            });

            return jsonResponse({ success: true, username: username.trim(), expiresAt, minutes });
        }

        if (method === "POST" && url.pathname === "/api/manox/temp-admins/edit-expire") {
            if (!checkAdminKey()) return jsonResponse({ success: false, message: "Não autorizado" }, 401);
            const { username, expiresAt, addMinutes } = await getBody();
            if (!username) return jsonResponse({ success: false, message: "Username necessário" }, 400);

            let newExpiresAt = expiresAt;

            // Se enviar addMinutes, soma minutos ao tempo atual
            if (!newExpiresAt && addMinutes) {
                newExpiresAt = now + (Number(addMinutes) * 60 * 1000);
            }

            if (!newExpiresAt) return jsonResponse({ success: false, message: "Forneça 'expiresAt' ou 'addMinutes'" }, 400);

            await fetch(`${SUPABASE_URL}/rest/v1/temp_admins?username=eq.${encodeURIComponent(username.trim())}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ expires_at: newExpiresAt })
            });

            return jsonResponse({ success: true, username: username.trim(), expiresAt: newExpiresAt });
        }

        if (method === "POST" && url.pathname === "/api/manox/temp-admins/remove") {
            if (!checkAdminKey()) return jsonResponse({ success: false, message: "Não autorizado" }, 401);
            const { username } = await getBody();
            if (!username) return jsonResponse({ success: false, message: "Username necessário" }, 400);

            await fetch(`${SUPABASE_URL}/rest/v1/temp_admins?username=eq.${encodeURIComponent(username.trim())}`, {
                method: "DELETE",
                headers
            });

            return jsonResponse({ success: true, message: `Temp Admin ${username} removido.` });
        }

        // --- ADMINS PERMANENTES ---
        if (method === "GET" && url.pathname === "/api/manox/admins") {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/permanent_admins?select=*`, { headers });
            const admins = await res.json();
            return jsonResponse({ success: true, admins: Array.isArray(admins) ? admins : [] });
        }

        if (method === "POST" && url.pathname === "/api/manox/admins/add") {
            if (!checkAdminKey()) return jsonResponse({ success: false, message: "Não autorizado" }, 401);
            const { username } = await getBody();
            if (!username) return jsonResponse({ success: false, message: "Username necessário" }, 400);

            await fetch(`${SUPABASE_URL}/rest/v1/permanent_admins`, {
                method: "POST",
                headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
                body: JSON.stringify({ username: username.trim(), added_at: now })
            });

            return jsonResponse({ success: true, username: username.trim() });
        }

        if (method === "POST" && url.pathname === "/api/manox/admins/remove") {
            if (!checkAdminKey()) return jsonResponse({ success: false, message: "Não autorizado" }, 401);
            const { username } = await getBody();
            if (!username) return jsonResponse({ success: false, message: "Username necessário" }, 400);

            await fetch(`${SUPABASE_URL}/rest/v1/permanent_admins?username=eq.${encodeURIComponent(username.trim())}`, {
                method: "DELETE",
                headers
            });

            return jsonResponse({ success: true, message: `Admin ${username} removido.` });
        }

        // --- DONOS (OWNERS) ---
        if (method === "GET" && url.pathname === "/api/manox/owners") {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/owners?select=*`, { headers });
            const owners = await res.json();
            return jsonResponse({ success: true, owners: Array.isArray(owners) ? owners : [] });
        }

        if (method === "POST" && url.pathname === "/api/manox/owners/add") {
            if (!checkAdminKey()) return jsonResponse({ success: false, message: "Não autorizado" }, 401);
            const { username } = await getBody();
            if (!username) return jsonResponse({ success: false, message: "Username necessário" }, 400);

            await fetch(`${SUPABASE_URL}/rest/v1/owners`, {
                method: "POST",
                headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
                body: JSON.stringify({ username: username.trim(), added_at: now })
            });

            return jsonResponse({ success: true, username: username.trim() });
        }

        if (method === "POST" && url.pathname === "/api/manox/owners/remove") {
            if (!checkAdminKey()) return jsonResponse({ success: false, message: "Não autorizado" }, 401);
            const { username } = await getBody();
            if (!username) return jsonResponse({ success: false, message: "Username necessário" }, 400);

            await fetch(`${SUPABASE_URL}/rest/v1/owners?username=eq.${encodeURIComponent(username.trim())}`, {
                method: "DELETE",
                headers
            });

            return jsonResponse({ success: true, message: `Owner ${username} removido.` });
        }

        // --- MENSAGENS DE SISTEMA & LIMPEZA DE CHAT ---
        if (method === "POST" && url.pathname === "/api/manox/system-message") {
            if (!checkAdminKey()) return jsonResponse({ success: false, message: "Não autorizado" }, 401);
            const { message } = await getBody();
            if (!message) return jsonResponse({ success: false }, 400);

            const sysMsg = { id: `system-${now}`, message: message.trim().slice(0, 250), created_at: now };
            await fetch(`${SUPABASE_URL}/rest/v1/system_messages`, { method: "POST", headers, body: JSON.stringify(sysMsg) });

            return jsonResponse({ success: true, message: sysMsg });
        }

        if (method === "GET" && url.pathname === "/api/manox/system-messages") {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/system_messages?select=*&order=created_at.desc&limit=50`, { headers });
            const messages = await res.json();
            return jsonResponse({ success: true, messages: Array.isArray(messages) ? messages.reverse() : [] });
        }

        if (method === "POST" && url.pathname === "/api/manox/chat/clear") {
            if (!checkAdminKey()) return jsonResponse({ success: false, message: "Não autorizado" }, 401);
            await fetch(`${SUPABASE_URL}/rest/v1/global_messages?id=neq.0`, { method: "DELETE", headers });
            return jsonResponse({ success: true, message: "Chat global limpo." });
        }

        if (method === "POST" && url.pathname === "/api/manox/server-chat/clear") {
            if (!checkAdminKey()) return jsonResponse({ success: false, message: "Não autorizado" }, 401);
            const { serverId } = await getBody();
            if (!serverId) return jsonResponse({ success: false }, 400);

            await fetch(`${SUPABASE_URL}/rest/v1/server_messages?server_id=eq.${encodeURIComponent(serverId.trim())}`, { method: "DELETE", headers });
            return jsonResponse({ success: true, message: "Chat do servidor limpo." });
        }

        return jsonResponse({ success: false, message: "Rota não encontrada" }, 404);
    }
};
