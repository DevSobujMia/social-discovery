# Heartlink — Current System Functional Documentation
**Document Version:** 1.0.0 (Production Discovery Baseline)  
**Target Repository:** `C:\Dev\social-discovery`  
**Inspection Date:** September 2026  
**Audience:** Operators, Product Managers, Engineers, and Executive Stakeholders  

---

# PART 1 — SYSTEM OVERVIEW

### 1.1 What This Website Currently Does
Heartlink is a dual-tier dating, relationship, and social discovery platform built using **Next.js 15 (App Router)**, **Prisma ORM**, and **PostgreSQL**. 

Unlike standard dating websites where users interact only peer-to-peer, Heartlink natively combines:
1. **Direct Peer Discovery & Dating:** Individual users can register, build profiles, search candidates by country/gender/intention, send likes or connects, match, and exchange direct messages.
2. **Staff-Assisted Concierge Matchmaking:** High-value or VIP profile owners authorize Heartlink's internal operations team (Admins and Matchmaking Agents) to manage their profiles, discover potential partners, and converse with interested customers **on their behalf**. The profile owner does not need to log in daily to reply to inbound leads; staff handles communication seamlessly via an internal Master Inbox, while the customer experiences a natural, unified conversation with the represented person.
3. **Paid Campaign Lead Routing:** Incoming traffic arriving from Facebook, Instagram, or TikTok ads with tracking parameters (UTMs) is attributed to specific marketing campaigns and automatically routed to assigned agents upon customer signup.

### 1.2 Main Purpose
- Provide an engaging, modern discovery interface for singles seeking long-term relationships, matrimony, casual dating, or friendship across international borders.
- Monetize and operationalize an authorized, white-glove assisted matchmaking service where professional matchmakers represent client profiles.
- Streamline lead intake, attribution, agent workload distribution, and conversation audit trails in a centralized CRM.

### 1.3 Main User Types & Roles
The system distinguishes between public platform users and internal operations staff:

1. **Public Users (`User` model):**
   - **Normal Customer (`profileOwnerType = self`):** Regular registered users who browse profiles, like candidates, match, and message.
   - **Assisted Profile Owner (`profileOwnerType = staff_assisted`):** Profiles registered and managed by staff under client authorization (e.g., Maya Lin). Customers can interact with them directly, but messaging is handled on their behalf by staff.
2. **Internal Staff (`StaffAccount` model):**
   - **Admin (`role = admin`):** Full system authority. Can view all platform users, manage all staff agents, inspect all conversations across the entire platform, reassign leads, configure ad campaign routes, review moderation reports, and view global analytics.
   - **Agent (`role = agent`):** Dedicated matchmakers or relationship managers. Agents can only view and handle customers explicitly assigned to them. Unassigned customer conversations yield an immediate `403 Forbidden` access barrier.

### 1.4 Main Workflows
1. **Ad Landing & Discovery Funnel:** Visitor clicks an ad with UTM parameters $\rightarrow$ explores candidates in public discovery $\rightarrow$ creates an account $\rightarrow$ UTM data captured and lead auto-assigned to an agent.
2. **Assisted Matchmaking:** Customer discovers an assisted profile (e.g., Maya) $\rightarrow$ clicks "Like" or "Send Message" $\rightarrow$ an assisted conversation is generated $\rightarrow$ assigned Agent or Admin replies from CRM on behalf of Maya $\rightarrow$ customer receives the message appearing from Maya.
3. **Peer-to-Peer Dating:** Customer A likes Customer B $\rightarrow$ Customer B likes Customer A $\rightarrow$ reciprocal match triggered $\rightarrow$ direct private conversation unlocked.
4. **CRM Lead Management & Assignment:** Admin oversees agent workloads $\rightarrow$ assigns unassigned leads or reassigns leads between agents $\rightarrow$ full assignment history and audit logs recorded.

---

# PART 2 — USER SIDE (PUBLIC APPLICATION)

The public application is a single-page interactive application rendered from `app/page.tsx` with three primary navigational views, modals, and persistent state.

---

### 2.1 Top Navigation & Header
- **Location:** Sticky header at the top of every view.
- **Components:**
  - **Logo & Branding:** "Heartlink — Global Discovery" with gradient heart icon.
  - **Desktop Navigation Tabs:** Buttons for `Discover`, `Messenger`, and `Profile` (when logged in). A notification dot appears on `Messenger` if any conversation has unread messages.
  - **CRM & Admin Direct Link:** A dedicated button (`/admin`) directing staff to the internal management portal in a new tab.
  - **Sign In / Avatar Button:** If unauthenticated, displays "Sign In". If authenticated, shows user profile photo avatar leading to the Profile tab.

---

### 2.2 Landing / Discovery View (`activeTab === 'discover'`)
1. **Purpose:** The primary portal where visitors and registered users browse candidates, filter results, and initiate romantic interactions.
2. **How to Reach It:** Navigate to `/` or click "Discover" on top or bottom navigation.
3. **Available Actions & Buttons:**
   - **Quick Gender Chips:** Toggle buttons for `All`, `Women` (`female`), and `Men` (`male`). Clicking re-fetches `/api/profiles` with gender filters.
   - **Filters Button (`SlidersHorizontal` icon):** Expands the advanced filter drawer.
   - **Refresh Button (`RefreshCw` icon):** Triggers an immediate reload of profiles from `/api/profiles`.
   - **Advanced Drawer Form:** Allows selecting `Filter by Country` (United States, United Kingdom, Bangladesh, Canada, Australia, Spain) and `Looking For` (Life Partner / Matrimony, Long-term Relationship, Casual Dating, Friendship). Has `Reset` and `Apply Filters` buttons.
   - **Profile Cards:** Grid display showing candidate photo, age, verification badge (`✓ Verified`), assisted status badge (`★ Assisted Service`), relationship goal, location (`MapPin`), bio snippet, and interest tags.
   - **Pass Button (`X` icon):** Records a `pass` interaction.
   - **View Bio Button:** Opens the detailed profile modal.
   - **Like Button (`Heart` icon):** Records a `like` interaction.
4. **What Happens After Clicking:**
   - If unauthenticated, clicking any interaction or "View Bio $\rightarrow$ Send Message" immediately prompts the **Authentication Modal**.
   - If authenticated, clicking `Like` or `Pass` dispatches a `POST /api/interactions` request.
   - If the target is an assisted profile (`profileOwnerType === 'staff_assisted'`), a `Like` immediately returns `isMatch: true`, creates a database `Match` record and an assisted `Conversation`, and opens the **Mutual Match Celebration Modal**.
5. **Data Saved:**
   - Creates or updates record in `interactions` table with `actorUserId`, `targetUserId`, `type = like | pass`, and `status = pending`.
   - Creates `analytics_events` entry with `eventType = like | pass`.
6. **User Feedback:**
   - Floating toast notification at top of screen: *"Liked! If they like you back, it will be a match! ❤️"* or *"Passed to next profile ⏩"*.
   - The like button turns solid brand color.

---

### 2.3 Profile Bio Modal (`selectedProfile`)
1. **Purpose:** Inspect detailed information about a candidate before deciding to like, pass, or message.
2. **How to Reach It:** Click anywhere on a profile card photo or click the "View Bio" button.
3. **Available Actions:**
   - **Close Button (`X`):** Dismisses modal.
   - **Pass Button:** Sends pass interaction and closes modal.
   - **Like Profile Button (for Peer Profiles):** Sends like interaction and closes modal.
   - **Send Message Button (for Staff-Assisted Profiles):** Direct initiation button.
4. **What Happens After Clicking "Send Message":**
   - Calls `POST /api/conversations` with `{ targetUserId }`.
   - Server returns or creates the assisted conversation.
   - Automatically switches the UI to the `Messenger` tab and selects this active conversation.
5. **Data Saved:**
   - Conversation record verified or created with `type = assisted`, `customerUserId = currentUser.id`, `representedProfileUserId = targetUserId`.
   - Participants added to `conversation_participants`.

---

### 2.4 Mutual Match Celebration Modal (`newMatchData`)
1. **Purpose:** Celebrates a successful match between the customer and another profile.
2. **Trigger:** Occurs when a mutual like is achieved (or instantly when liking a staff-assisted profile).
3. **Available Actions:**
   - **"Send a Message" Button:** Dismisses modal, navigates to `Messenger` tab, and opens the chat thread.
   - **"Keep Exploring" Button:** Dismisses modal and remains on the Discover grid.

---

### 2.5 Messenger View (`activeTab === 'messenger'`)
1. **Purpose:** Read and send messages to matches and assisted profiles.
2. **How to Reach It:** Click "Messenger" on the navigation bar, or click "Send a Message" from the match celebration modal or profile bio modal.
3. **Layout & Elements:**
   - **Sidebar (Conversation Thread List):**
     - Displays counterpart photo, name, timestamp of last message, unread indicator, and last message preview text.
     - Unread badge pulse dot if `unreadCount > 0`.
     - Refresh button to reload `/api/conversations`.
   - **Active Chat Window:**
     - Header: Counterpart name, avatar, and active status indicator.
     - Message History Area: Scrollable chat bubble stream. Messages sent by current user are right-aligned with pink gradient and delivery/read checkmarks (`✓` for sent, `✓✓` for read). Inbound messages are left-aligned in dark surface gray. Staff-assisted messages display an `(Assisted)` indicator for transparent UI tracking.
     - Message Composer: Input field and Send button (`Send` icon).
4. **What Happens After Sending a Message:**
   - Message text is dispatched via `POST /api/conversations/[id]/messages` with `{ content, contentType: 'text' }`.
   - Appends message immediately to local state and clears input.
   - Updates `lastMessageAt` and `lastMessagePreview` on `conversations` table.
   - Increments `unreadCount` for other participants.
   - Background polling updates message statuses every 3000ms.
5. **Read/Unread Behavior:**
   - When the user opens a conversation, `GET /api/conversations/[id]/messages` automatically resets the user's `unreadCount` to 0 in `conversation_participants` and updates message statuses from `sent` to `read` in the database.

---

### 2.6 Profile & Settings View (`activeTab === 'profile'`)
1. **Purpose:** View account details, edit dating preferences, and logout.
2. **How to Reach It:** Click "Profile" on desktop header or mobile bottom bar.
3. **Available Actions:**
   - **Profile Card Summary:** Displays profile photo, full name, email, gender badge, and country badge.
   - **Log Out Button (`LogOut` icon):** Calls `POST /api/auth/logout`, clears session cookie, wipes client state, and redirects to Discover.
   - **Edit Profile Details Form:**
     - `Relationship Intention`: Dropdown options (`life_partner`, `relationship`, `dating`, `friendship`).
     - `About Me (Bio)`: Multiline text area.
     - `Interests & Tags`: Comma-separated input field (e.g., `Travel, Art, Music, Coffee`).
     - `Save Changes` Button: Dispatches `PATCH /api/profiles`.
4. **Data Saved:**
   - Updates `bio`, `lookingFor`, and parses comma-separated string into `interests: string[]` in the `profiles` table.
   - Toast confirms *"Profile updated successfully! ✨"*.

---

### 2.7 Authentication Modal (Login & Registration)
1. **Purpose:** Onboard new visitors or authenticate returning users.
2. **How to Reach It:** Click "Sign In", click any action while unauthenticated, or click persona buttons.
3. **Modes:**
   - **Login Mode:** Email and password inputs $\rightarrow$ `POST /api/auth/login`.
   - **Signup Mode:** Full Display Name, Gender, Country, Email, and Password inputs $\rightarrow$ `POST /api/auth/signup`.
   - **1-Click Test Persona Login:** 3 instant buttons (`Daniel Kim`, `Elena Rostova`, `Aisha Rahman`) enabling immediate 1-click credential sign-in (`User@123456`) without typing.
4. **Data Saved on Signup:**
   - Creates `users` record with hashed password (`bcryptjs`, cost 12).
   - Creates associated `profiles` record.
   - Retrieves any stored UTM tags in browser `sessionStorage('heartlink_utm')`, creates `utm_attributions` record, and automatically triggers campaign agent assignment if a route matches.
   - Issues JWT token stored in HTTP-only `auth_token` cookie (7-day validity).

---

# PART 3 — STAFF-ASSISTED MATCHMAKING

### 3.1 Concrete Step-by-Step Workflow Example
To explain the operational mechanics, we trace the exact lifecycle implemented in code:

- **Customer:** John (`User.id = user-john`, `profileOwnerType = self`)
- **Assisted Profile:** Maya Lin (`User.id = user-maya`, `profileOwnerType = staff_assisted`)
- **Assigned Matchmaking Agent:** Sarah (`StaffAccount.id = staff-sarah`, `role = agent`)
- **Super Admin:** Admin (`StaffAccount.id = staff-admin`, `role = admin`)

```
+-----------------------------------------------------------------------------------+
|                           ASSISTED MATCHMAKING LIFECYCLE                          |
+-----------------------------------------------------------------------------------+
  John (Customer)                                 System / Staff CRM (Sarah/Admin)
       |                                                         |
       | 1. Discovers Maya Lin on public Discover feed           |
       |    (Tagged with "★ Assisted Service" badge)             |
       |                                                         |
       | 2. Clicks "View Bio" -> Clicks "Send Message"           |
       |    OR clicks Heart ("Like")                             |
       |                                                         |
       +-------> POST /api/conversations ------------------------+
       |         (or POST /api/interactions)                     |
       |                                                         |
       |                                    System: Automatically detects Maya is  |
       |                                    profileOwnerType = 'staff_assisted'.   |
       |                                    Creates Match and Conversation:       |
       |                                      type: 'assisted'                    |
       |                                      customerUserId: John's ID           |
       |                                      representedProfileUserId: Maya's ID |
       |                                                         |
       | 3. John opens Messenger and types:                      |
       |    "Hi Maya! Loved your travel photos."                 |
       |                                                         |
       +-------> POST /api/conversations/[id]/messages ---------->
       |         (senderUserId = John.id)                        |
       |                                                         |
       |                                    CRM Master Inbox:                     |
       |                                    New thread appears:                   |
       |                                    "Customer: John <-> Profile: Maya"    |
       |                                    Handled by: Sarah                     |
       |                                                         |
       |                                    Sarah opens chat in CRM.              |
       |                                    CRM dynamically binds reply to Maya.  |
       |                                    Sarah types:                          |
       |                                    "Thank you John! I love hiking in UK."|
       |                                                         |
       |<------- POST /api/admin/conversations/[id]/messages ----+
       |         senderStaffId = staff-sarah                     |
       |         sentOnBehalfOf = user-maya                      |
       |         isAssisted = true                               |
       |                                                         |
       |                                    System: Creates AuditLog entry:       |
       |                                    action: 'message.send_on_behalf'      |
       |                                                         |
       | 4. John receives incoming message.                      |
       |    GET /api/conversations/[id]/messages                 |
       |    Sender identity is masked to "Maya Lin".             |
       |    Staff identity is completely hidden from customer.   |
       v                                                         v
```

### 3.2 Key Technical Columns & Enums in Code
The entire assisted pipeline is powered by specific architectural fields across `prisma/schema.prisma`:

| Field / Column | Model / Location | Type / Value | Purpose & Implemented Behavior |
| :--- | :--- | :--- | :--- |
| `profileOwnerType` | `User` | `self` \| `staff_assisted` | Flags whether this account is self-operated by a customer or operated on their behalf by staff. |
| `type` | `Conversation` | `direct` \| `assisted` | Indicates whether the conversation is direct peer-to-peer or staff-assisted concierge chat. |
| `customerUserId` | `Conversation` | `String?` (FK `User`) | Identifies the actual paying customer / lead in this conversation. |
| `representedProfileUserId` | `Conversation` | `String?` (FK `User`) | Identifies the profile owner on whose behalf staff communicates. |
| `senderUserId` | `Message` | `String?` (FK `User`) | Populated when a message is sent by an actual registered user from the public app. |
| `senderStaffId` | `Message` | `String?` (FK `StaffAccount`) | Populated when a message is sent by an operator from the CRM. |
| `sentOnBehalfOf` | `Message` | `String?` (FK `User`) | Foreign key pointing to the assisted profile user ID whose persona is being represented. |
| `isAssisted` | `Message` | `Boolean` (default `false`) | Flag marking the message as an assisted communication. |

### 3.3 Internal Storage & Customer Masking
- **In the Database:** The message record stores `senderStaffId: 'staff-sarah'` and `sentOnBehalfOf: 'user-maya'`. This creates an immutable audit trail of who typed the message.
- **In Public API (`GET /api/conversations/[id]/messages`):**
  When John fetches messages, the backend evaluates:
  ```typescript
  if (m.sentOnBehalfOf || m.senderStaffId) {
    senderName = m.onBehalfOf?.profile?.displayName || fallbackRepresentedName; // "Maya Lin"
    senderId = m.sentOnBehalfOf;
  }
  ```
  John's browser receives `senderName: "Maya Lin"` and `senderId: user-maya`. Sarah's name, email, and staff ID are never sent to the public client.
- **In Staff CRM (`GET /api/admin/conversations/[id]/messages`):**
  Staff members see full internal disclosure:
  `Maya Lin (Sent by Sarah [agent])` with the assisted badge.

### 3.4 Audit Trail Logging
Every time a staff member sends a message on behalf of a profile, the route executes:
```typescript
await prisma.auditLog.create({
  data: {
    staffId: staff.id,
    action: 'message.send_on_behalf',
    targetType: 'conversation',
    targetId: id,
    details: {
      operatorRole: staff.role,
      operatorDisplayName: staff.displayName,
      sentOnBehalfOf: targetProfileId,
      messageId: message.id,
      contentPreview: content.trim().substring(0, 100),
    },
  },
});
```

### 3.5 Handover to Profile Owner
If Maya Lin eventually chooses to converse directly with John:
1. Maya has an existing record in the `users` table with an email and password hash.
2. Maya logs into Heartlink's public web application using her credentials.
3. Because she is a participant in the conversation (`conversation_participants`), John's thread appears directly in her public Messenger view.
4. When Maya types in Messenger, her messages are dispatched through the user route (`POST /api/conversations/[id]/messages`), setting `senderUserId = user-maya` and `senderStaffId = null`.
5. Staff can monitor the ongoing thread in read-only capacity or step back in at any time.

---

# PART 4 — ADMIN PANEL (`/admin`)

The Admin Panel (`app/admin/page.tsx`) is a specialized operations CRM accessible at `/admin`. It has authentication guards, persona switches, and six functional tabs.

---

### 4.1 Staff Authentication & Persona Picker
- **Who Can Access:** Internal staff only (`StaffAccount` with role `admin` or `agent`). Unauthenticated visitors see the staff login form.
- **Instant 1-Click Persona Login:**
  - `👑 Super Admin`: `admin@heartlink.com` / `Admin@123456`
  - `👩‍💼 Sarah (Agent / Matchmaker)`: `sarah@heartlink.com` / `Agent@123456`
  - `🧑‍💼 Alex (Agent / Relationship Coach)`: `alex@heartlink.com` / `Agent@123456`
- **Session Behavior:** Authenticates via `POST /api/auth/login`, issuing a staff JWT cookie (`type: 'staff'`). Top header displays the operator's display name, role badge, and role switcher buttons.

---

### 4.2 Tab 1: Dashboard & KPIs (`activeTab === 'analytics'`)
- **Purpose:** Monitor real-time platform metrics, agent lead distribution, and campaign volumes.
- **Who Can Use:** Admins and Agents.
- **Data Displayed:**
  - **KPI Cards:**
    - `Total Registered Users`: Total customer accounts in database.
    - `Signups Today`: Volume registered in the last 24 hours.
    - `Active Conversations`: Count of open direct and assisted chats.
    - `Total Messages Sent`: Aggregate engagement metric across all threads.
  - **Agent Lead Load:** Table listing all registered agents, their emails, and count of active leads currently assigned.
  - **Ad Attribution & Campaigns:** List of active campaigns, UTM strings, lead counts, and link copy buttons.
- **Actions:** Click the refresh button (`RefreshCw`) to re-query `/api/admin/analytics`.

---

### 4.3 Tab 2: User Management (`activeTab === 'users'`)
- **Purpose:** Inspect registered leads, review profile details, assign matchmakers, and moderate accounts.
- **Who Can Use:**
  - **Admins:** View all platform users (customers and assisted profiles).
  - **Agents:** View only the users actively assigned to them.
- **Controls & Filters:**
  - Search input: Real-time query matching user email, phone, or display name.
  - Status filter: Dropdown filtering by `All Status`, `active`, `suspended`, or `blocked`.
- **Table Columns:**
  - `User / Profile`: Avatar, display name, and email/phone.
  - `Country & Gender`: Location and gender identity.
  - `Looking For`: Relationship goal badge.
  - `Assigned Agent`: Name of currently assigned matchmaker (or "Unassigned" in gray italics).
  - `Status`: Green badge for `active`, red for `suspended`.
  - `Actions`:
    - **"Assign" Button:** Opens the Lead Assignment modal.
    - **"Suspend" / "Activate" Button:** Toggles account status between `active` and `suspended` via `PATCH /api/admin/users/[id]`. Suspended accounts cannot log in or send messages.

---

### 4.4 Tab 3: Lead Assignments (`activeTab === 'assignments'`)
- **Purpose:** Review matchmaker capacity and distribute incoming leads.
- **Who Can Use:** Admin role.
- **Elements:**
  - Grid of Agent Cards displaying agent name, role, email, and large numerical badge showing active lead load (`_count.agentAssignments`).
- **Modal ("Assign Lead to Matchmaker"):**
  - Select Agent: Dropdown of all active staff agents.
  - Internal Notes: Text area to document client preferences or handling instructions (e.g., *"Lead requested partner in London with travel interests"*).
  - Dispatches `POST /api/admin/assignments`. Deactivates any existing assignment, marks previous record as `transferred`, creates a new `agent_assignments` record, logs an `assignment_history` entry, and writes to `audit_logs`.

---

### 4.5 Tab 4: Master Inbox (`activeTab === 'inbox'`)
- **Purpose:** Central communication hub to monitor customer conversations and reply on behalf of assisted profiles.
- **Detailed breakdown in Part 5 below.**

---

### 4.6 Tab 5: Campaigns & Routing (`activeTab === 'campaigns'`)
- **Purpose:** Create marketing campaigns, configure UTM parameters, assign default agents, and copy shareable ad links.
- **Who Can Use:** Admin role.
- **Elements:**
  - **"Create Campaign" Button:** Opens creation modal with fields: Campaign Name, Platform (`facebook`, `instagram`, `tiktok`, `google`, `other`), UTM Campaign identifier (must be unique), and Routed Agent dropdown.
  - **Campaign Cards:** Displays campaign name, platform tag, status (`active`), `utm_campaign=...` string, routed agent name, and **"Copy Ad Link"** button.
  - Clicking "Copy Ad Link" copies the complete tracking URL (e.g., `https://domain/?utm_source=facebook&utm_medium=cpc&utm_campaign=fb_expat_women`) directly to the clipboard.

---

### 4.7 Tab 6: Moderation & Reports (`activeTab === 'reports'`)
- **Purpose:** Review user flags and resolve safety incidents.
- **Who Can Use:** Admin role.
- **Backend Connection:** Queries `GET /api/admin/reports`. Displays reported user, reporter, reason (`spam`, `fake_profile`, `harassment`, `inappropriate_content`), and status (`pending`, `reviewed`, `action_taken`, `dismissed`).
- **Actions Available:** Mark report resolved, dismiss report, or suspend the reported user directly.

---

# PART 5 — ADMIN MASTER INBOX

The Master Inbox is the central operational workstation for matchmakers and administrators.

```
+----------------------------------------------------------------------------------------------------+
|                                    MASTER INBOX SCREEN LAYOUT                                      |
+--------------------------------------------------+-------------------------------------------------+
| THREAD LIST (Left Pane)                          | CHAT WINDOW (Right Pane)                        |
|                                                  |                                                 |
| [Customer: John <-> Profile: Maya Lin]           | Customer: John <-> Profile: Maya Lin            |
| [Assisted] • Agent: Sarah        10:45 AM        | Staff Assisted Matchmaking Active • Sarah       |
| "Thank you John! I love hiking in the UK."       +-------------------------------------------------+
|                                                  | John (10:42 AM):                                |
| [Customer: Daniel <-> Profile: Elena Rostova]    |   Hi Maya! Loved your travel photos.            |
| Direct • Unassigned              09:15 AM        |                                                 |
| "Are you free this weekend?"                     | Maya Lin (Sent by Sarah) (10:45 AM): [Assisted] |
|                                                  |   Thank you John! I love hiking in the UK.      |
|                                                  +-------------------------------------------------+
|                                                  | Reply on behalf of Maya Lin    Operator: Sarah  |
|                                                  | [ Type reply as Maya Lin...           ] [Send]  |
+--------------------------------------------------+-------------------------------------------------+
```

### 5.1 How to Find a Conversation
1. Navigate to `/admin` and click the **Master Inbox** tab.
2. The left pane populates all conversations via `GET /api/admin/conversations`.
3. If logged in as **Admin**, all platform conversations appear.
4. If logged in as an **Agent (e.g., Sarah)**, the list automatically filters to only show conversations where the customer is assigned to that agent.

### 5.2 How to Identify the Counterparts
Each conversation card in the left list displays:
- **Customer:** The name of the client/lead (e.g., `Customer: John`).
- **Profile:** The name of the person being contacted (e.g., `Profile: Maya Lin`).
- **Badges:** A teal `[Assisted]` badge appears if the target profile is staff-assisted.
- **Assigned Agent:** Shows `Agent: Sarah` or `Agent: Unassigned`.
- **Last Message:** Shows timestamp and preview text.

### 5.3 How "Reply on Behalf of Maya" Works
1. Staff clicks the conversation card in the left pane.
2. The right pane loads all messages via `GET /api/admin/conversations/[id]/messages`.
3. The bottom reply composer dynamically reads the profile name:
   `Reply on behalf of Maya Lin | Operator: Sarah (agent)`.
4. Staff types the message into the input field and clicks **Send**.
5. The form dispatches:
   ```json
   POST /api/admin/conversations/[id]/messages
   {
     "content": "I would love to meet for coffee when you visit London!",
     "sentOnBehalfOf": "user-maya-id"
   }
   ```
6. **What Happens in the Database:**
   - A new record is inserted into `messages` with:
     - `senderStaffId = staff-sarah-id`
     - `sentOnBehalfOf = user-maya-id`
     - `isAssisted = true`
     - `status = sent`
   - `conversations.lastMessagePreview` is updated.
   - The customer's unread counter increments by 1.
   - An entry is written to `audit_logs`.
7. **What John (the Customer) Sees:**
   - In his Messenger view, a message bubble appears on the left from **Maya Lin**.
   - John does not see Sarah's name, staff ID, or internal notes.
8. **What Staff Sees Internally:**
   - The bubble renders with a teal border:
     `Maya Lin (Sent by Sarah) [Assisted]`.
9. **What Audit Trail Records:**
   - Action: `message.send_on_behalf`.
   - Target: Conversation ID.
   - Operator: Sarah (`staff-sarah-id`, role `agent`).
   - Content snippet: `"I would love to meet for coffee..."`.

---

# PART 6 — AGENT / ASSISTANT SYSTEM

### 6.1 Role Distinction: "Assistant" vs "Agent"
- **Code Inspection Truth:** In `prisma/schema.prisma`, the staff role enum is strictly defined as:
  ```prisma
  enum StaffRole {
    admin
    agent
  }
  ```
  There is **NO separate "Assistant" role** in the database schema.
- **Why "Assistant" Appears in the UI:**
  "Assistant" was used in UI labels, badges, and marketing descriptions (e.g., *"Assisted Service"*, *"Matchmaking Assistant"*). In backend logic and permissions, all assistants are stored as `StaffAccount` with `role = agent`.

### 6.2 Agent Permissions vs Admin Permissions

| Feature / Action | Admin | Agent |
| :--- | :---: | :---: |
| Access Admin Portal (`/admin`) | Allowed | Allowed |
| View KPIs & Analytics Tab | Global data | Global data |
| View Users List (`/api/admin/users`) | All users | **Assigned leads only** |
| Suspend / Delete Users | Allowed | **Forbidden** (Admin only) |
| Create New Agents | Allowed | **Forbidden** (Admin only) |
| Reassign Leads Between Agents | Allowed | **Forbidden** (Admin only) |
| View Campaigns Tab & Create Routes | Allowed | **Forbidden** (Admin only) |
| View Master Inbox (`/api/admin/conversations`) | All conversations | **Assigned leads only** |
| Open Chat Messages (`/api/admin/conversations/[id]/messages`) | All chats | **Assigned leads only** |
| Reply on Behalf of Profile | All chats | **Assigned leads only** |
| Resolve Moderation Reports | Allowed | **Forbidden** (Admin only) |

### 6.3 What Happens When an Agent Attempts Unauthorized Access
If Agent Alex (`alex@heartlink.com`) tries to load or send a message in a conversation involving John (who is assigned to Sarah), the backend API checks:
```typescript
if (staff.role === 'agent') {
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId: id },
    select: { userId: true },
  });
  const userIds = participants.map(p => p.userId);
  const hasAccess = await prisma.agentAssignment.findFirst({
    where: {
      agentId: staff.id,
      userId: { in: userIds },
      status: 'active',
    },
  });
  if (!hasAccess) return error('Access denied', 403);
}
```
The server rejects the request immediately with an HTTP `403 Forbidden` error.

---

# PART 7 — CAMPAIGN / AD ROUTING

### 7.1 Overview: Internal Attribution Engine
> [!IMPORTANT]
> Heartlink's campaign system is an **internal UTM attribution and lead routing engine**. It does not create ads on Meta or Google Ads Manager via external APIs; rather, it tracks traffic generated by those external platforms and connects new incoming customers directly to specific matchmaker agents.

```
+-----------------------------------------------------------------------------------+
|                           CAMPAIGN & LEAD ROUTING PIPELINE                        |
+-----------------------------------------------------------------------------------+
 1. Admin creates Campaign in /admin:
    - Name: "UK Expat Professionals"
    - utm_campaign: "uk_expat_promo"
    - Routed Agent: Sarah
    - Platform: Facebook
           |
 2. Admin copies link:
    https://heartlink.com/?utm_source=facebook&utm_medium=cpc&utm_campaign=uk_expat_promo
           |
 3. Ad is published on Facebook. John clicks ad and lands on Heartlink.
           |
 4. Public App (app/page.tsx):
    Captures UTM params from URL.
    Saves to sessionStorage('heartlink_utm').
    Fires /api/events ("ad_landing_view").
           |
 5. John browses and registers (app/api/auth/signup):
    - User account created.
    - utm_attributions record linked to John.
    - System checks CampaignAgentRoute for "uk_expat_promo".
    - Active route found -> agentId = Sarah.
           |
 6. Automatic Lead Assignment:
    - agent_assignments created (userId = John, agentId = Sarah).
    - assignment_history created (action = 'assigned').
           |
 7. Result:
    When John messages Maya, the conversation immediately appears in Sarah's inbox.
    Sarah handles John's matchmaking journey from day one.
+-----------------------------------------------------------------------------------+
```

### 7.2 UTM Parameter Schema
The system captures six standard UTM and tracking variables:
- `utm_source`: The advertising origin (e.g., `facebook`, `instagram`, `tiktok`, `google`).
- `utm_medium`: The medium type (e.g., `cpc`, `stories`, `bio_link`).
- `utm_campaign`: The unique identifier connecting the lead to an internal `Campaign` record.
- `utm_content`: Optional ad variant or creative tag.
- `utm_term`: Optional audience keyword.
- `referrer_url` & `landing_page`: Origin URL and entry page.

---

# PART 8 — DATABASE & BACKEND LOGIC

The database is defined in `prisma/schema.prisma` with 17 relational models. Below is an explanation of the core models and their operational purpose:

```
                                  +-------------------+
                                  |   StaffAccount    |
                                  +-------------------+
                                    |        |       |
                 +------------------+        |       +--------------------+
                 | (creates/agents)          | (assignedBy/agent)         | (creates)
                 v                           v                            v
          +--------------+          +-----------------+          +--------------------+
          |     User     |<-------->| AgentAssignment |          | CustomerReqs       |
          +--------------+          +-----------------+          +--------------------+
            |          |                     |
   (has 1)  |          | (has many)          | (history)
            v          v                     v
      +---------+  +-------------+  +-------------------+
      | Profile |  | Interaction |  | AssignmentHistory |
      +---------+  +-------------+  +-------------------+
            |              |
      (photos)             | (forms)
            v              v
      +--------------+ +-------+
      | ProfilePhoto | | Match |
      +--------------+ +-------+
                           |
                     (creates/links)
                           v
                   +----------------+
                   |  Conversation  |
                   +----------------+
                     |            |
         (participants)         (messages)
                     v            v
      +---------------------+  +---------+
      | ConvParticipant     |  | Message |
      +---------------------+  +---------+
```

### 8.1 Models & Functional Roles

1. **`User`:**
   - **Purpose:** Core authentication entity for public members.
   - **Key Fields:** `email`, `phone`, `passwordHash`, `signupStage`, `status` (`active`, `suspended`, `blocked`, `deleted`), `profileOwnerType` (`self`, `staff_assisted`).
2. **`Profile`:**
   - **Purpose:** Public persona data attached 1-to-1 to a User.
   - **Key Fields:** `displayName`, `gender`, `country`, `city`, `bio`, `interests` (`String[]`), `lookingFor`, `isVerified`, `isVisible`.
3. **`ProfilePhoto`:**
   - **Purpose:** Image gallery items linked to a Profile.
   - **Key Fields:** `filePath`, `isPrimary`, `sortOrder`, `uploadedBy` (`user` or `staff`).
4. **`StaffAccount`:**
   - **Purpose:** Internal CRM operators and matchmakers.
   - **Key Fields:** `email`, `passwordHash`, `displayName`, `role` (`admin`, `agent`), `status` (`active`, `suspended`).
5. **`CustomerRequirements`:**
   - **Purpose:** Detailed partner preferences documented for assisted profile clients.
   - **Key Fields:** `ageRangeMin`, `ageRangeMax`, `preferredGender`, `preferredCountries`, `relationshipIntention`, `travelDestination`, `additionalNotes`, `createdById` (FK `StaffAccount`).
6. **`Interaction`:**
   - **Purpose:** Records swipe actions.
   - **Key Fields:** `actorUserId`, `targetUserId`, `type` (`like`, `pass`, `save`, `connect`), `status` (`pending`, `accepted`, `declined`). Unique on `[actorUserId, targetUserId, type]`.
7. **`Match`:**
   - **Purpose:** Created when mutual interest is achieved (or automatically when a user likes an assisted profile).
   - **Key Fields:** `userAId`, `userBId`, `matchedAt`, `status` (`active`, `unmatched`).
8. **`Conversation`:**
   - **Purpose:** Thread container for chat communication.
   - **Key Fields:** `matchId`, `type` (`direct`, `assisted`), `customerUserId`, `representedProfileUserId`, `status` (`active`, `archived`, `blocked`), `lastMessageAt`, `lastMessagePreview`.
9. **`ConversationParticipant`:**
   - **Purpose:** Links users to conversations and tracks read state.
   - **Key Fields:** `conversationId`, `userId`, `unreadCount`, `lastReadAt`.
10. **`Message`:**
    - **Purpose:** Individual chat communication entries.
    - **Key Fields:** `conversationId`, `senderUserId`, `senderStaffId`, `sentOnBehalfOf`, `content`, `contentType` (`text`, `image`, `emoji`, `system`), `status` (`sent`, `delivered`, `read`), `isAssisted`.
11. **`AgentAssignment`:**
    - **Purpose:** Designates which matchmaker agent owns which customer lead.
    - **Key Fields:** `userId`, `agentId`, `assignedBy`, `status` (`active`, `transferred`, `removed`), `notes`.
12. **`AssignmentHistory`:**
    - **Purpose:** Audit record of lead assignments and transfers between agents.
    - **Key Fields:** `userId`, `previousAgentId`, `newAgentId`, `action` (`assigned`, `transferred`, `removed`), `performedBy`, `reason`.
13. **`Campaign` & `CampaignAgentRoute`:**
    - **Purpose:** Internal ad tracking and automatic routing mapping.
    - **Key Fields:** `name`, `platform`, `utmCampaign`, `status`, `agentId`, `isActive`.
14. **`UtmAttribution`:**
    - **Purpose:** Stores origin tracking tags linked to a registered customer.
15. **`AuditLog`:**
    - **Purpose:** Immutable compliance record of staff actions.
    - **Key Fields:** `staffId`, `action`, `targetType`, `targetId`, `details` (`Json`), `ipAddress`.
16. **`Report`:**
    - **Purpose:** Community moderation flags submitted against users.
    - **Key Fields:** `reporterId`, `reportedUserId`, `reason`, `status`, `reviewedBy`.
17. **`BlockedUser`:**
    - **Purpose:** Blocks between pairs of users preventing discovery or messaging.

---

# PART 9 — PERMISSIONS & SECURITY

### 9.1 Access Control Matrix

| Feature / Resource | Public Guest | Authenticated Customer | Staff Agent | Staff Admin |
| :--- | :---: | :---: | :---: | :---: |
| Browse Discover Feed | Yes | Yes | Yes (via User App) | Yes (via User App) |
| Filter by Gender / Country / Goal | Yes | Yes | Yes | Yes |
| Like / Pass Profiles | Prompts Auth | Yes | Yes (if testing as user) | Yes (if testing as user) |
| Send / Receive Direct Messages | No | Yes (own threads) | No (uses CRM) | No (uses CRM) |
| Edit Personal Profile | No | Yes | No | Yes (via Admin API) |
| Access Admin CRM (`/admin`) | No | No (redirects) | **Yes** | **Yes** |
| View Global KPIs & Analytics | No | No | Yes | Yes |
| View Customer Leads List | No | No | **Assigned only** | **All users** |
| Suspend / Activate User | No | No | **Forbidden (403)** | **Yes** |
| Delete User Account | No | No | **Forbidden (403)** | **Yes** |
| Create / Manage Agents | No | No | **Forbidden (403)** | **Yes** |
| Assign / Transfer Leads | No | No | **Forbidden (403)** | **Yes** |
| View Master Inbox | No | No | **Assigned only** | **All threads** |
| Read / Reply to Messages | No | Own chat only | **Assigned only** | **All threads** |
| Create Ad Campaigns | No | No | **Forbidden (403)** | **Yes** |
| Moderate Reports & Flags | No | No | **Forbidden (403)** | **Yes** |

### 9.2 Security Implementations in Code
- **Password Security:** All passwords (both customers and staff) are hashed with `bcryptjs` using a salt work factor of 12 before being stored.
- **JWT Authentication:** Sessions utilize signed JSON Web Tokens (`lib/auth.ts`) specifying user type (`user` vs `staff`), stored in HTTP-only, SameSite cookies (`auth_token`).
- **Rate Limiting:** Signup endpoint enforces in-memory rate limiting (maximum 10 registrations per IP per hour in production).
- **Agent Isolation Enforcement:** All agent requests to `/api/admin/conversations`, `/api/admin/conversations/[id]/messages`, and `/api/admin/users` query active `agent_assignments`. Attempting to access an unassigned lead returns `403 Forbidden`.
- **Identity Privacy Masking:** Public conversation routes explicitly strip `senderStaffId` and replace staff operator names with the represented profile's display name.

---

# PART 10 — COMPLETE REAL-WORLD USAGE EXAMPLES

### Example A: Normal Customer Finds Someone and Chats Normally
1. **User Action:** Daniel Kim logs into Heartlink.
2. Navigates to **Discover**, selects filter "Women", and sees Elena Rostova (`profileOwnerType = self`).
3. Daniel clicks the **Heart** icon (Like).
4. Elena logs in later, navigates to Discover, and clicks Like on Daniel.
5. System identifies reciprocal likes: creates `Match` and a direct `Conversation`.
6. Both Daniel and Elena see the match in their **Messenger** sidebar.
7. Daniel types: *"Hi Elena, nice to meet you!"*.
8. Elena receives the message, sees Daniel's avatar, and replies.

---

### Example B: Customer Discovers Maya, Sends Message, Staff Replies on Behalf of Maya
1. **User Action:** Customer John visits Heartlink.
2. In Discover, John sees Maya Lin with the purple `★ Assisted Service` badge.
3. John clicks "View Bio" and then clicks **Send Message**.
4. The system automatically creates an assisted conversation (`type: 'assisted'`).
5. John types in Messenger: *"Hello Maya! I noticed you enjoy traveling in Spain. I'm visiting Barcelona next month."*
6. **Staff Action:** Matchmaker Sarah logs into `/admin`.
7. Sarah clicks **Master Inbox**. John's thread appears: `Customer: John ↔ Profile: Maya Lin (Assisted)`.
8. Sarah opens the thread and types: *"Hello John! Yes, Barcelona is breathtaking, especially the Gothic Quarter. What dates will you be there?"*
9. Sarah clicks Send.
10. **Customer Result:** John receives the message appearing seamlessly from Maya Lin.

---

### Example C: Customer is Assigned to Agent Sarah
1. **Admin Action:** Super Admin logs into `/admin` and opens the **User Management** tab.
2. Finds newly registered customer Michael.
3. Admin clicks **Assign** on Michael's row.
4. Selects `Sarah (Agent)` from the dropdown and adds internal note: *"VIP lead, interested in international matrimony"*.
5. Admin clicks Submit.
6. Michael's assigned agent updates to Sarah.
7. When Sarah logs into her CRM account, Michael immediately appears in her assigned user list and Master Inbox.

---

### Example D: Sarah Finds a Suitable Profile Based on Customer's Requirements
1. **Staff Action:** Sarah opens customer Michael's profile in CRM or public app.
2. Reviews Michael's documented preferences (e.g., Women aged 25–35 living in the UK or Canada).
3. Sarah uses the public Discover filters to locate suitable candidates (e.g., Maya Lin or Elena).
4. Sarah initiates contact or guides communication between the profiles on behalf of the client.

---

### Example E: Admin Takes Over a Conversation
1. **Admin Action:** Super Admin logs into `/admin` and opens the **Master Inbox**.
2. Notice a critical conversation handled by Agent Sarah that requires executive attention.
3. Admin clicks the conversation to inspect full history.
4. Admin enters a response in the composer.
5. Message is delivered to the customer on behalf of Maya, with the audit log recording `staffId: staff-admin-id` as the operator.

---

### Example F: Admin Reassigns Customer from Sarah to Alex
1. **Admin Action:** Super Admin opens the **User Management** tab.
2. Locate customer John (currently assigned to Sarah).
3. Admin clicks **Assign**, selects **Agent Alex**, and enters reason: *"Sarah going on leave"*.
4. System updates existing assignment status to `transferred` and creates a new active assignment for Alex.
5. John's chat vanishes from Sarah's inbox and immediately appears in Alex's inbox.

---

### Example G: Facebook Campaign A Routes to Sarah, Campaign B Routes to Alex
1. **Admin Action:** Admin opens **Campaigns & Routing** tab.
2. Creates Campaign 1: Name: *"UK Matrimony"*, `utm_campaign = uk_matrimony`, Routed Agent = **Sarah**.
3. Creates Campaign 2: Name: *"US Singles"*, `utm_campaign = us_singles`, Routed Agent = **Alex**.
4. Admin copies both shareable URLs.
5. **Customer Action 1:** Visitor clicks the UK ad URL (`...&utm_campaign=uk_matrimony`) and registers. The system automatically attributes the lead and assigns them to **Sarah**.
6. **Customer Action 2:** Visitor clicks the US ad URL (`...&utm_campaign=us_singles`) and registers. The system automatically attributes the lead and assigns them to **Alex**.

---

# PART 11 — CURRENT LIMITATIONS & NOT IMPLEMENTED

This section details features that are partially implemented, omit frontend controls, or rely on manual procedures.

### 11.1 Features Implemented on Backend but Missing UI Controls in `app/page.tsx`
1. **Block and Report User Buttons:**
   - **Backend Status:** Fully implemented. `POST /api/block` blocks users and updates conversations to `status: 'blocked'`. `POST /api/report` logs abuse reports with categories.
   - **UI Reality:** In `app/page.tsx`, there are currently **no clickable "Block" or "Report" buttons** rendered on profile cards or in the active chat header. Customers currently have no button to trigger these actions from the public UI.
2. **"Save Profile" / Bookmark Button:**
   - **Backend Status:** The `interactions` table supports `type = save`, and the API handles it.
   - **UI Reality:** In `app/page.tsx`, profile cards provide buttons for "Pass" (`X`), "View Bio", and "Like" (`Heart`). There is no dedicated "Save/Bookmark" button rendered on the card.
3. **Multi-Photo File Upload Widget:**
   - **Backend Status:** Multi-photo schema and `/api/upload` endpoint exist.
   - **UI Reality:** In the customer's Profile Edit tab (`app/page.tsx`), users can edit bio, relationship intention, and interests tags, but there is no file upload button to upload new photo files directly from the browser. Photos are loaded from seed data or initial setup.

### 11.2 Architectural Nuances & Constraints
4. **Lead Assignment is User-Level, Not Conversation-Level:**
   - Agent assignment is stored on the `User` model (`AgentAssignment.userId`). It assigns a customer to an agent. Consequently, all conversations involving that customer are accessible to that assigned agent. Individual conversation threads cannot be split between different agents if they involve the same customer.
5. **Real-Time Messaging Mechanism:**
   - Messaging updates do not utilize WebSockets or Server-Sent Events (SSE). Both public Messenger and Admin Master Inbox utilize polling via `setInterval` every 3000ms (3 seconds).
6. **Customer Requirements Entry:**
   - The `CustomerRequirements` table exists in Prisma schema. However, in the admin UI, matchmakers document notes inside the "Internal Notes" field of the assignment modal rather than a dedicated multi-field requirements builder.
7. **Automated Handover Switch:**
   - There is no single "Handover" toggle button that changes `profileOwnerType` from `staff_assisted` to `self`. Handover is achieved by giving the assisted client their login credentials to access the account directly.

---

# PART 12 — CURRENT QA STATUS

Automated end-to-end verification and compiler audits confirm the current operational baseline:

| Test Suite / Category | Scope Verified | Result |
| :--- | :--- | :---: |
| **Core Assisted Matchmaking** | Customer discovery $\rightarrow$ like $\rightarrow$ instant match $\rightarrow$ customer message $\rightarrow$ staff inbox display $\rightarrow$ staff reply on behalf of profile $\rightarrow$ customer receipt $\rightarrow$ identity masking | **100% PASS** |
| **Direct Peer Matching** | Non-assisted user discovery $\rightarrow$ reciprocal like check $\rightarrow$ direct match creation $\rightarrow$ direct message exchange | **100% PASS** |
| **Agent Role-Based Access Control** | Agent assignment scoping $\rightarrow$ assigned lead visible $\rightarrow$ unassigned lead blocked with HTTP 403 on GET/POST | **100% PASS** |
| **Campaign & Lead Auto-Routing** | UTM parameter capture $\rightarrow$ signup attribution $\rightarrow$ automatic agent assignment $\rightarrow$ workload metric increment | **100% PASS** |
| **TypeScript Strict Compiler** | `npx tsc --noEmit` across all pages, components, and API route handlers | **0 Errors (PASS)** |
| **Production Build** | `npm run build` compiling static and dynamic Next.js routes | **0 Errors (PASS)** |

---

# FINAL SECTION — HOW TO OPERATE THE SYSTEM
### (A Non-Technical Business Operator's Guide)

Follow this step-by-step guide to run daily operations on Heartlink:

---

### 1. How to Log In as Staff
1. Open your web browser and go to `https://your-domain.com/admin`.
2. Enter your staff email and password (or click your persona name for instant test login).
3. Click **Sign In to Staff CRM**. You are now in the operational control center.

---

### 2. How to Review New Incoming Leads
1. Click the **User Management** tab on the left sidebar.
2. Review the list of users. You will see their display name, country, relationship goals, and who is currently handling them.
3. If an incoming user has no agent, their "Assigned Agent" column will read *Unassigned*.

---

### 3. How to Assign a Lead to a Matchmaker (Agent)
1. On the **User Management** tab, find the unassigned customer.
2. Click the **Assign** button on the right side of their row.
3. A popup will appear. Select which Agent (e.g., Sarah or Alex) should handle this lead.
4. (Optional) Type any notes in the box (e.g., *"Client looking for travel partner in Europe"*).
5. Click **Assign Lead**. The customer is now officially assigned.

---

### 4. How to Handle Messages in the Master Inbox
1. Click the **Master Inbox** tab on the left sidebar.
2. On the left side of your screen, you will see a list of conversation cards:
   - Example: `Customer: John ↔ Profile: Maya Lin`
3. Click on the conversation you want to review.
4. The chat history will load in the center of the screen.
5. In the message box at the bottom, notice the label:
   `Reply on behalf of Maya Lin | Operator: [Your Name]`.
6. Type the message you want to send to John as Maya Lin.
7. Click the **Send** button.
8. The customer receives your reply as if it came directly from Maya Lin.

---

### 5. How to Create an Ad Campaign with Auto-Routing
1. Click the **Campaigns & Routing** tab on the left sidebar.
2. Click the **+ Create Campaign** button in the top right corner.
3. Fill in the short form:
   - **Campaign Name:** Enter a recognizable name (e.g., *"Spring London Expats"*).
   - **Platform:** Select Facebook, Instagram, TikTok, or Google.
   - **UTM Campaign:** Enter a single lowercase keyword with underscores (e.g., `london_expats_2026`).
   - **Assigned Agent:** Select the matchmaker who will automatically receive all leads from this ad (e.g., Sarah).
4. Click **Create Campaign**.
5. Find your new campaign card on the screen and click **Copy Ad Link**.
6. Paste this exact link into your Facebook/Instagram ad. When people click your ad and register, they will automatically be assigned to Sarah without any manual work.

---

### 6. How to Transfer a Customer to a Different Agent
1. If Sarah is sick or going on vacation, go to **User Management**.
2. Find the customer assigned to Sarah.
3. Click **Assign**.
4. Select **Alex** from the dropdown and write a note: *"Reassigning due to vacation"*.
5. Click Submit. The lead and all their chats now immediately move to Alex's inbox.

---

### 7. How to Suspend a Problematic User
1. Go to **User Management**.
2. Find the user breaking community rules.
3. Click the red **Suspend** button on the right.
4. The user's status immediately switches to *suspended*. They will be prevented from logging in or sending further messages. To restore them, simply click **Activate**.

---

# SYSTEM SUMMARY METRICS

- **Total Public Application Pages / Views:** 3 primary tabs (`Discover`, `Messenger`, `Profile`) + 3 interactive modals (`Bio Details`, `Mutual Match Celebration`, `Authentication Modal`).
- **Total Admin Panel Tabs / Modules:** 6 comprehensive management tabs (`Dashboard & KPIs`, `User Management`, `Lead Assignments`, `Master Inbox`, `Campaigns & Routing`, `Moderation & Reports`).
- **Total Operational Roles:** 2 Staff Roles (`admin`, `agent`) + 2 Public User Types (`self` [normal customer], `staff_assisted` [concierge profile]).
- **Total Major Workflows:** 4 full workflows (Public Discovery & Peer Dating, Staff-Assisted Concierge Matchmaking, Lead Assignment & Transfer Engine, Paid Ad Attribution & Auto-Routing).
- **What is Fully Working:**
  - Public discovery, filtering, liking, passing, and mutual matching.
  - Staff-assisted profile representation and transparent customer messaging.
  - Internal Master Inbox with automatic profile persona binding.
  - Customer identity masking (hiding staff names from public chat).
  - Agent role-based access control and 403 protection on unassigned customers.
  - Internal campaign creation, shareable URL generation, and auto-lead routing.
  - Admin user suspension and activation.
  - Full audit trail logging for staff messages and lead assignments.
- **What is Partially Working:**
  - Block and Report (fully functional backend APIs, but UI buttons are not currently placed in `app/page.tsx`).
  - Profile photo management (photos display correctly, but multi-file upload widget is not present in public profile edit form).
- **What is NOT Implemented:**
  - No separate database role for "Assistant" (assistants operate as `agent`).
  - No external Facebook Marketing API synchronization (routing is handled via internal UTM URL attribution).
  - No WebSocket connection (real-time chat updates run on 3000ms short polling).
