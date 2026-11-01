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
            headers: { 
                "Content-Type": "application/json", 
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type, x-manox-key",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
            }
        });

        // --- SUPORTE A CORS PREFLIGHT (OBRIGATÓRIO PARA SITES WEB) ---
        if (method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, x-manox-key"
                }
            });
        }

        const getBody = async () => { try { return await request.json(); } catch { return {}; } };

        // Validação estrita via Header 'x-manox-key'
        const checkAdminKey = () => {
            const clientKey = request.headers.get("x-manox-key");
            return clientKey && clientKey === env.ADMIN_API_KEY;
        };

        const now = Date.now();

        // --- ROTA DE VERIFICAÇÃO DE CHAVE (VIA HEADER X-MANOX-KEY) ---
        if (method === "GET" && url.pathname === "/api/manox/verify") {
            const isValid = checkAdminKey();
            if (isValid) {
                return jsonResponse({ valid: true, message: "Chave válida!" }, 200);
            } else {
                return jsonResponse({ valid: false, message: "Chave incorreta ou ausente." }, 401);
            }
        }

        // --- JOB ID ---
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

        // ==========================================
// ROBLOX USER LOOKUP
// ==========================================

if (
    method === "GET" &&
    url.pathname === "/api/manox/roblox-user"
) {
    const username = url.searchParams.get("username");

    if (!username) {
        return jsonResponse({
            success: false,
            message: "Username necessário"
        }, 400);
    }

    try {
        // Buscar usuário pelo username
        const robloxResponse = await fetch(
            "https://users.roblox.com/v1/usernames/users",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    usernames: [username.trim()],
                    excludeBannedUsers: false
                })
            }
        );

        if (!robloxResponse.ok) {
            return jsonResponse({
                success: false,
                message: "Erro ao consultar Roblox"
            }, 502);
        }

        const robloxData =
            await robloxResponse.json();

        const user =
            robloxData.data &&
            robloxData.data[0];

        // Usuário não existe
        if (!user) {
            return jsonResponse({
                success: true,
                exists: false,
                username: username.trim()
            });
        }

        const userId = user.id;

        // Buscar avatar
        let avatar = null;

        try {
            const thumbnailResponse =
                await fetch(
                    "https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=" +
                    encodeURIComponent(userId) +
                    "&size=150x150&format=Png&isCircular=false"
                );

            if (thumbnailResponse.ok) {
                const thumbnailData =
                    await thumbnailResponse.json();

                if (
                    thumbnailData.data &&
                    thumbnailData.data[0]
                ) {
                    avatar =
                        thumbnailData.data[0].imageUrl || null;
                }
            }
        } catch (error) {
            console.error(
                "Erro ao buscar avatar:",
                error
            );
        }

        return jsonResponse({
            success: true,
            exists: true,
            userId: userId,
            username: user.name,
            displayName: user.displayName,
            avatar: avatar
        });

    } catch (error) {
        return jsonResponse({
            success: false,
            message: "Erro ao consultar dados do Roblox"
        }, 500);
    }
}

// 1. ALTERAR VISIBILIDADE DA TAG (POST)
if (method === "POST" && url.pathname === "/api/manox/user/tag-visibility-set") {
    if (!checkAdminKey()) return jsonResponse({ success: false, message: "Não autorizado" }, 401);

    const { username, visible } = await getBody();

    if (!username || typeof visible !== "boolean") {
        return jsonResponse({ success: false, message: "Parâmetros 'username' e 'visible' (boolean) são obrigatórios." }, 400);
    }

    // Atualiza a preferência no Supabase
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_logs?username=eq.${encodeURIComponent(username.trim())}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ tag_visible: visible })
    });

    if (!res.ok) {
        return jsonResponse({ success: false, message: "Erro ao atualizar no banco de dados." }, 500);
    }

    return jsonResponse({ 
        success: true, 
        username: username.trim(), 
        tagVisible: visible 
    });
}

// 2. CONSULTAR VISIBILIDADE DA TAG (GET)
if (method === "GET" && url.pathname === "/api/manox/user/tag-visibility") {
    const username = url.searchParams.get("username");

    if (!username) {
        return jsonResponse({ success: false, message: "Parâmetro 'username' é obrigatório." }, 400);
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_logs?username=eq.${encodeURIComponent(username.trim())}&select=tag_visible&limit=1`, { headers });
    const data = await res.json();

    if (Array.isArray(data) && data.length > 0) {
        const isVisible = data[0].tag_visible !== false; // Se for null ou undefined, padrão é true
        return jsonResponse({ 
            success: true, 
            username: username.trim(), 
            tagVisible: isVisible 
        });
    }

    // Se o usuário ainda não tiver registro, retorna o padrão (true)
    return jsonResponse({ 
        success: true, 
        username: username.trim(), 
        tagVisible: true 
    });
}

// 1. CONSULTAR VERSÃO ATUAL DO HUB (GET)
if (method === "GET" && url.pathname === "/api/manox/version") {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hub_version?id=eq.1&select=version,updated_at`, { headers });
    const data = await res.json();

    if (Array.isArray(data) && data.length > 0) {
        return jsonResponse({ success: true, version: data[0].version, updatedAt: data[0].updated_at });
    }

    return jsonResponse({ success: true, version: "4.4.1", updatedAt: now });
}

// 2. ATUALIZAR / INCREMENTAR VERSÃO DO HUB (POST)
if (method === "POST" && url.pathname === "/api/manox/version/update") {
    if (!checkAdminKey()) return jsonResponse({ success: false, message: "Não autorizado" }, 401);

    const { type, manualVersion } = await getBody();

    // Busca a versão atual do banco
    const currentRes = await fetch(`${SUPABASE_URL}/rest/v1/hub_version?id=eq.1&select=version`, { headers });
    const currentData = await currentRes.json();
    let currentVersion = (Array.isArray(currentData) && currentData.length > 0) ? currentData[0].version : "4.4.1";

    let newVersion = currentVersion;

    if (manualVersion) {
        // Se enviou uma versão específica (ex: "5.0.0")
        newVersion = manualVersion.trim();
    } else if (type) {
        // Separa os números da versão atual [MAJOR, MINOR, PATCH]
        let parts = currentVersion.split('.').map(num => parseInt(num, 10) || 0);
        if (parts.length < 3) parts = [4, 4, 1];

        if (type === "patch") {
            // Bugs corrigidos (+0.0.1) -> 4.4.1 vira 4.4.2
            parts[2] += 1;
        } else if (type === "minor") {
            // Atualização (+0.1.0) -> 4.4.1 vira 4.5.0
            parts[1] += 1;
            parts[2] = 0;
        } else if (type === "major") {
            // Atualização grande (+1.0.0) -> 4.4.1 vira 5.0.0
            parts[0] += 1;
            parts[1] = 0;
            parts[2] = 0;
        } else {
            return jsonResponse({ success: false, message: "Tipo inválido. Use 'patch', 'minor' ou 'major'." }, 400);
        }

        newVersion = parts.join('.');
    } else {
        return jsonResponse({ success: false, message: "Forneça o 'type' ('patch', 'minor', 'major') ou 'manualVersion'." }, 400);
    }

    // Salva a nova versão no Supabase
    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/hub_version`, {
        method: "POST",
        headers: { 
            ...headers, 
            "Prefer": "resolution=merge-duplicates,return=representation" 
        },
        body: JSON.stringify({ 
            id: 1, 
            version: newVersion, 
            updated_at: now 
        })
    });

    if (!updateRes.ok) {
        const errText = await updateRes.text();
        return jsonResponse({ success: false, message: "Erro ao atualizar versão no banco.", details: errText }, 500);
    }

    return jsonResponse({ 
        success: true, 
        oldVersion: currentVersion, 
        newVersion: newVersion, 
        updatedAt: now 
    });
}

// GET /api/manox/test-script (public read)
if (method === "GET" && url.pathname === "/api/manox/test-script") {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/test_scripts?id=eq.1&select=script,updated_at&limit=1`,
        { headers }
    );

    if (!res.ok) {
        return jsonResponse({
            success: false,
            message: "Não foi possível carregar o Test Script."
        }, 500);
    }

    const rows = await res.json();
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    return jsonResponse({
        success: true,
        script: row && typeof row.script === "string" ? row.script : "",
        updatedAt: row ? Number(row.updated_at) || null : null
    });
}

// POST /api/manox/test-script (admin only)
if (method === "POST" && url.pathname === "/api/manox/test-script") {
    if (!checkAdminKey()) {
        return jsonResponse({
            success: false,
            message: "Não autorizado."
        }, 401);
    }

    const body = await getBody();
    if (typeof body.script !== "string") {
        return jsonResponse({
            success: false,
            message: "O campo 'script' precisa ser um texto."
        }, 400);
    }

    // Limite de segurança: 2 MB de texto.
    if (body.script.length > 2000000) {
        return jsonResponse({
            success: false,
            message: "O script ultrapassa o limite de 2 MB."
        }, 413);
    }

    const updatedAt = Date.now();
    const saveRes = await fetch(
        `${SUPABASE_URL}/rest/v1/test_scripts?on_conflict=id`,
        {
            method: "POST",
            headers: {
                ...headers,
                "Prefer": "resolution=merge-duplicates,return=representation"
            },
            body: JSON.stringify({
                id: 1,
                script: body.script,
                updated_at: updatedAt
            })
        }
    );

    if (!saveRes.ok) {
        const details = await saveRes.text();
        console.error("Erro ao salvar Test Script:", details);

        return jsonResponse({
            success: false,
            message: "Erro ao salvar o Test Script no Supabase."
        }, 500);
    }

    return jsonResponse({
        success: true,
        message: "Test Script salvo com sucesso.",
        updatedAt
    });
}

        return jsonResponse({ success: false, message: "Rota não encontrada" }, 404);
    }
};
