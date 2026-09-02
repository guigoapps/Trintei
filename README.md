# Guigo — Trintei 30 — Guia de Configuração

## O que mudou nesta versão

- **A capa é a tela inicial**: quando o site abre, aparece só a "capa do álbum" (GUIGO, TRINTEI 30, data, local) com o campo de telefone. Não tem disco nem som ainda nesse momento.
- **Depois do login**: a capa de login some, a música (`musicas.mp3`) começa a tocar baixinho em loop, e o disco preto passa a ser o topo de cada aba — como se fosse a "capa" daquela página. Tocar no disco pausa/retoma a música.
- **Troca de aba já sobe a página**: ao tocar em um item da barra inferior, a tela já rola suavemente passando o disco, direto pro título daquela aba. Se a pessoa rolar pra cima de novo, vê o disco girando e pode pausar/tocar.
- **4 abas**: Convidados, Local, Informações (nova) e Festa.
- **Convidados**: sem o botão "Trocar número" — a pessoa fica logada nesse navegador. O horário de chegada agora tem hora e minuto em campos separados.
- **Informações**: reúne hospedagem (quartos, banheiros, cozinha), refeições, trilha até a bica e atividades do hotel — antes estava dentro de "Local".
- Guigo foi adicionado à lista de convidados.

## Sobre o autoplay do áudio

Os navegadores bloqueiam áudio automático com som antes de qualquer interação do usuário. Como a música só começa a tocar **depois que a pessoa envia o formulário de login** (uma ação real de clique), isso normalmente é suficiente para o navegador liberar o autoplay. Em casos raros onde ainda assim for bloqueado, a pessoa pode tocar no discozinho no canto superior para iniciar manualmente.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A página inteira (capa, revelação do disco e as 3 abas) |
| `style.css` | Visual — paleta azul-marinho, cantos arredondados |
| `script.js` | Transição capa → disco → app, abas, checklist, áudio de fundo, copiar endereço |
| `rsvp.js` | Login por telefone e confirmação de presença |
| `supabase-config.js` | **Aqui você cola suas credenciais do Supabase** |
| `supabase-schema.sql` | Cria a tabela, a lista de convidados (incluindo você) e as funções |

---

## 1. Adicionar a música

Coloque `musicas.mp3` na mesma pasta do `index.html`.

---

## 2. Configurar o Supabase

### 2.1 Criar o projeto

1. [supabase.com](https://supabase.com) → crie uma conta → **New Project**.
2. Nome, senha de banco, região mais próxima → aguarde ~2 minutos.

### 2.2 Criar a tabela, os convidados e as funções

1. **SQL Editor** → **New query**.
2. Cole todo o conteúdo de `supabase-schema.sql` → **Run**.
3. Isso cria a tabela, cadastra os convidados (incluindo Guigo) e as três funções que o site usa.

> Lista mudou? Edite o bloco `insert into public.guests (...)` no SQL antes de rodar, ou rode um `insert` avulso depois.

### 2.3 Pegar a URL e a chave pública

**Project Settings → API** → copie **Project URL** e a chave **anon / public**. Nunca use a `service_role` key no site.

### 2.4 Colar no site

Em `supabase-config.js`, troque `COLE_SUA_URL_AQUI` e `COLE_SUA_ANON_KEY_AQUI` pelos valores copiados.

### Sobre a segurança

A tabela `guests` fica bloqueada para acesso direto — todo acesso passa pelas três funções (`get_guest_by_phone`, `submit_rsvp`, `get_attendance_summary`), e nenhuma delas devolve a lista completa de nomes.

Lembre-se: o "login" por telefone é uma identificação simples, sem senha — qualquer um que souber o telefone de alguém da lista consegue editar a resposta dessa pessoa. Para uma festa entre amigos/família isso costuma bastar, mas vale você saber da limitação.

---

## 3. Publicar no GitHub Pages

1. Envie todos os arquivos (incluindo `musicas.mp3`) para o repositório.
2. **Settings → Pages** → escolha a branch e a pasta `/root` → **Save**.

---

## Como testar

1. Abra o site — deve aparecer só a capa (sem disco, sem som).
2. Digite um telefone de teste (ex: `96496804` para André, ou `997346237` para o próprio Guigo) e envie.
3. Confirme que o disco preto aparece girando por um instante, a música começa baixinho, e o app abre na aba Convidados já com "Oi, {nome}".
4. Escolha um dia e horário, confirme, e veja o resumo atualizar.
5. Toque no discozinho da barra superior para pausar/retomar a música.
6. Na aba Local, teste o ícone de copiar ao lado do endereço e os links de Maps/Waze/Uber.
7. Toque em "Trocar número" e confirme que volta pra capa.

---

## Personalizar mais tarde

- Horário de chegada disponível: 9h às 23h, em `rsvp.js` (`fillTimeSelect`).
- Volume da música de fundo: em `script.js`, `audio.volume = 0.15` (0 a 1).
- Duração da tela do disco: em `script.js`, dentro de `window.__enterApp__`.
