# Requirements Document

## Introduction

The Lab Measurement Request System is a web-based platform that enables company employees worldwide to submit measurement requests to regional labs. It manages the full lifecycle of a request — from submission through lab assignment, processing, and result delivery — while supporting multiple user roles, lab routing, and status notifications.

## Glossary

- **System**: The Lab Measurement Request System
- **Requestor**: A company employee who submits a measurement request
- **Lab_Technician**: A lab employee who processes assigned measurement requests
- **Lab_Manager**: A user responsible for managing a lab's capacity, assignments, and technician workload
- **Admin**: A system administrator who manages users, labs, and system configuration
- **Request**: A measurement request submitted by a Requestor, containing method, material, purpose, and metadata
- **Method**: A defined lab procedure to be applied to a material sample
- **Material**: The physical sample or substance to be measured
- **Lab**: A regional facility capable of performing one or more Methods
- **Assignment**: The association of a Request to a specific Lab and Lab_Technician
- **Result**: The measurement outcome produced by a Lab_Technician for a given Request
- **Status**: The current lifecycle state of a Request
- **SSO**: Company Single Sign-On identity provider

---

## Requirements

### Requirement 1: User Authentication

**User Story:** As a company employee, I want to log in using my company credentials, so that I do not need a separate account to access the system.

#### Acceptance Criteria

1. WHEN a user accesses the System, THE System SHALL redirect unauthenticated users to the company SSO login page
2. WHEN a user successfully authenticates via SSO, THE System SHALL create or update the user's session and grant access based on the user's assigned role
3. WHEN an SSO session expires, THE System SHALL redirect the user to the SSO login page and preserve the user's last-visited URL for post-login redirect
4. IF authentication fails, THEN THE System SHALL display a descriptive error message and deny access to protected resources

---

### Requirement 2: User Role Management

**User Story:** As an Admin, I want to assign roles to users, so that each person has access only to the functions relevant to their responsibilities.

#### Acceptance Criteria

1. THE System SHALL support exactly four roles: Requestor, Lab_Technician, Lab_Manager, and Admin
2. WHEN an Admin assigns a role to a user, THE System SHALL apply the new role permissions immediately upon the user's next authenticated action
3. THE System SHALL enforce role-based access control such that Requestors cannot access lab management functions, Lab_Technicians cannot access admin functions, and Lab_Managers cannot access other labs' data
4. IF a user attempts to access a resource outside their role's permissions, THEN THE System SHALL return an authorization error and log the attempt

---

### Requirement 3: Request Submission

**User Story:** As a Requestor, I want to submit a measurement request, so that a lab can perform the required analysis on my material.

#### Acceptance Criteria

1. WHEN a Requestor submits a Request, THE System SHALL require the following fields: Method, Material description, purpose description, and desired completion date
2. WHEN a Requestor submits a Request, THE System SHALL assign a unique identifier to the Request and record the submission timestamp and the Requestor's identity
3. WHEN a Requestor submits a Request with missing required fields, THE System SHALL reject the submission and return a descriptive validation error identifying each missing or invalid field
4. WHEN a Request is successfully submitted, THE System SHALL set the Request Status to "Submitted" and send a confirmation notification to the Requestor

---

### Requirement 4: Request Lifecycle and Status Tracking

**User Story:** As a Requestor, I want to track the status of my request, so that I know where it is in the process and when results are ready.

#### Acceptance Criteria

1. THE System SHALL maintain the following ordered Status values for every Request: Submitted → Assigned → In_Progress → Results_Ready → Closed
2. WHEN a Request's Status changes, THE System SHALL record the previous Status, the new Status, the timestamp, and the identity of the user who triggered the change
3. WHILE a Request has Status "Submitted", THE System SHALL allow the Requestor to edit the Request's non-identifying fields
4. WHEN a Request reaches Status "Assigned", THE System SHALL prevent the Requestor from editing the Request without Lab_Manager approval
5. THE System SHALL display the current Status and full status history to the Requestor and to the assigned Lab

---

### Requirement 5: Lab Routing and Assignment

**User Story:** As a Lab_Manager, I want requests to be routed to the appropriate lab, so that requests are handled by a lab with the right capabilities and capacity.

#### Acceptance Criteria

1. WHEN a Request is submitted, THE System SHALL identify candidate Labs that support the requested Method
2. WHEN multiple candidate Labs exist, THE System SHALL rank them by the Requestor's region proximity first, then by current open Request count ascending
3. WHEN a Lab_Manager accepts a Request, THE System SHALL set the Request Status to "Assigned" and record the accepting Lab's identifier
4. IF no candidate Lab supports the requested Method, THEN THE System SHALL notify the Requestor and the Admin, and set the Request Status to "Unroutable"
5. WHERE a Lab_Manager manually overrides the routing, THE System SHALL record the override reason and the Lab_Manager's identity

---

### Requirement 6: Request Processing

**User Story:** As a Lab_Technician, I want to manage my assigned requests, so that I can track my workload and update request progress.

#### Acceptance Criteria

1. WHEN a Lab_Manager assigns a Request to a Lab_Technician, THE System SHALL set the Request Status to "In_Progress" and notify the Lab_Technician
2. WHILE a Request has Status "In_Progress", THE Lab_Technician SHALL be able to add progress notes to the Request
3. WHEN a Lab_Technician marks a Request as complete, THE System SHALL require at least one Result to be attached before allowing the Status transition to "Results_Ready"
4. IF a Lab_Technician is unavailable, THEN THE Lab_Manager SHALL be able to reassign the Request to another Lab_Technician within the same Lab without resetting the Status

---

### Requirement 7: Result Delivery

**User Story:** As a Requestor, I want to receive measurement results, so that I can use the data for my work.

#### Acceptance Criteria

1. WHEN a Request reaches Status "Results_Ready", THE System SHALL notify the Requestor via the in-app notification channel and via email
2. THE System SHALL make Results available for download by the Requestor in their original uploaded format
3. WHEN a Requestor acknowledges receipt of Results, THE System SHALL set the Request Status to "Closed" and record the acknowledgement timestamp
4. THE System SHALL retain Results and all Request data for a minimum of 7 years after the Request reaches Status "Closed"

---

### Requirement 8: Notifications

**User Story:** As a user, I want to receive timely notifications about relevant status changes, so that I can act without manually polling the system.

#### Acceptance Criteria

1. WHEN a Request Status changes, THE System SHALL deliver an in-app notification to all users associated with the Request within 30 seconds of the status change
2. WHEN a Request Status changes to "Results_Ready" or "Assigned", THE System SHALL also send an email notification to the relevant Requestor or Lab_Technician respectively
3. WHERE a user has configured notification preferences, THE System SHALL apply those preferences to suppress or redirect notification channels accordingly
4. IF an email notification fails to deliver, THEN THE System SHALL retry delivery up to 3 times with exponential backoff before logging a delivery failure

---

### Requirement 9: Lab and Method Administration

**User Story:** As an Admin, I want to manage labs and their supported methods, so that the routing system has accurate capability data.

#### Acceptance Criteria

1. THE Admin SHALL be able to create, update, and deactivate Lab records, each containing: name, region, supported Methods, and contact information
2. WHEN a Lab is deactivated, THE System SHALL prevent new Requests from being routed to that Lab and notify the Lab_Manager of the deactivation
3. THE Admin SHALL be able to create, update, and deactivate Method records, each containing: name, description, and required material type
4. WHEN a Method is deactivated, THE System SHALL prevent new Requests from referencing that Method and display a descriptive message to Requestors who attempt to select it

---

### Requirement 10: Global Accessibility

**User Story:** As a company employee in any region, I want the system to be accessible from my location, so that I can submit and track requests regardless of where I am working.

#### Acceptance Criteria

1. THE System SHALL be accessible via HTTPS from any network location where the company SSO is reachable
2. THE System SHALL render correctly in the latest two major versions of Chrome, Firefox, Edge, and Safari
3. WHEN a user's browser locale is detected, THE System SHALL display dates and times in the user's local timezone with the timezone identifier shown
4. THE System SHALL support concurrent access by users in at least 5 geographic regions without degradation of response time beyond 2 seconds for standard page loads
