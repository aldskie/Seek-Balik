📌 SEEK \& BALIK — Lost \& Found Management System



A centralized web-based Lost and Found Management System designed for schools or institutions to efficiently report, track, and recover lost or found items. The system supports role-based dashboards, claim verification, and meeting scheduling between item owners and administrators.



🚀 Features

👤 Public Users

View all found and lost items

Search items by name, category, location, or status

Submit claim requests for items

Track item status updates

🧑‍💼 Claim System

Submit ownership claims with:

Full name

Email address

Contact number

Proof/description

Admin review of claim requests

Schedule verification meetings

Claim status tracking (Pending / Approved / Rejected)

🧑‍🏫 Admin Dashboard

Full control over system data

Manage:

Lost items

Found items

Users

Reports

Claim requests

Approve or reject claims

Schedule claimant meetings

🧑‍🔧 Moderator Dashboard

Manage lost item reports

View and update item statuses

Assist in validating reports

Limited access compared to admin

📦 Item Management Features

Add new lost/found items

Edit item details

Update item status:

Pending

Claimed

Approved

Archived

Upload item images

Categorize items (Keys, Electronics, IDs, Accessories, etc.)

Assign item location (Campus areas)

🔔 Claim \& Meeting System

Users can submit claim requests per item

Admin receives and reviews claims

Admin can schedule meeting using:

Date \& time picker

System stores meeting schedules

Notification-ready structure (backend supported)

🔍 Search \& Filtering

Search items by:

Title

Category

Location

Poster name

Status

Filter only active (non-claimed) items

🧑‍💻 Authentication \& Roles

Role-based system:

Admin

Moderator

Public user (guest view)

Protected routes for dashboard access

Persistent login using localStorage

🏗️ Tech Stack

Frontend

React.js

React Router

Context API (state management)

Tailwind CSS (UI styling)

Axios (API communication)

Backend

Django REST Framework

SQLite / PostgreSQL (depending on setup)

RESTful API architecture

⚙️ Core Functions

Frontend Functions

submitClaimRequest() → Sends claim data to backend

createLostItem() → Adds new lost item

createFoundItem() → Adds found item

getItems() → Fetch all items

getClaims() → Fetch claim requests

scheduleMeeting() → Schedule claimant verification

Backend Functions (Django)

create\_claim() → Handles claim creation

Claim model → Stores claimant data

Item model → Stores lost/found items

Meeting scheduling endpoint

REST API serializers for validation

📁 Project Structure (Simplified)

frontend/

&#x20;├── components/

&#x20;├── pages/

&#x20;├── context/

&#x20;├── api/



backend/

&#x20;├── items/

&#x20;├── claim/

&#x20;├── account/

&#x20;├── notification/

📌 Status System

Status	Meaning

Pending	Item not yet verified

Claimed	Claim submitted

Approved	Claim accepted

Archived	Item closed

📬 Future Improvements

Real-time notifications (WebSockets)

Email verification system

QR-based item tagging

Mobile responsive improvements

Audit logs for admin actions

"# Seek-Balik" 
