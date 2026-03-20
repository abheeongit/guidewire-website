# Valor Shield

## Overview
Valor Shield is a parametric micro-insurance product for gig delivery workers.

The idea is simple: workers pay a weekly premium, and payouts are triggered when verified external disruptions (for example heavy rain, pollution spikes, or city restrictions) reduce their ability to work.

## Problem
Delivery workers can lose a meaningful part of daily income because of conditions they cannot control.

Most existing insurance products are not designed for this type of short-cycle, disruption-driven income risk.

## Solution
Valor Shield combines disruption monitoring with claim validation and automated payouts.

Core flow:
- Worker selects a weekly plan
- System monitors disruption signals in the active region
- Risk and legitimacy checks run continuously
- Eligible claims are processed with minimal manual intervention

## Key Features
- Hyper-local risk map
- Dynamic premium logic
- Predictive disruption alerts
- Fraud detection and claim validation
- Income stability dashboard
- Automatic parametric claim processing

## BRAN Engine
BRAN is the decision layer used for:
- Risk scoring
- Fraud detection
- Activity validation
- Payout recommendation

## Weekly Plans

| Plan | Premium | Coverage |
|------|--------|----------|
| Basic | ₹20 | ₹200 |
| Premium | ₹35 | ₹350 |
| Elite | ₹50 | ₹500 |

## Tech Stack
Frontend: React  
Backend: FastAPI  
AI/ML: Python (Scikit-learn, Pandas, NumPy)  
Database: PostgreSQL  
External APIs: Weather, AQI, Traffic  
Payments: Wallet / Razorpay (Test Mode)

## Workflow
User -> Select Plan -> Monitoring -> Disruption Detected -> AI Validation -> Payout

## What Is Different
Valor Shield uses parametric triggers, but does not rely on triggers alone.

A second validation layer checks worker activity and fraud signals before payout decisions.

## Architecture (High Level)
The system is organized as a decision pipeline:
- Signal ingestion: weather, AQI, traffic, and worker activity events are collected continuously.
- Feature assembly: disruption severity, route behavior, device trust, and work continuity features are computed.
- Decision engine: BRAN scores risk, fraud likelihood, and payout eligibility.
- Outcome routing: claims go to auto-approve, soft-review, or monitor.
- Feedback loop: reviewed outcomes are fed back to improve thresholds and model calibration.

In short: external disruption signals decide "should payout be considered," and behavior/trust signals decide "can payout be trusted."

## Current Scope vs Next Scope

| Area | Current Scope | Next Scope |
|------|---------------|------------|
| Triggers | Weather/AQI/traffic-backed disruption logic | Higher-frequency feeds and provider redundancy |
| Claims | Parametric workflow with soft-review path | Policy-aware rule engine and explainability logs |
| Fraud Controls | Activity + trust signal checks | Stronger graph-based ring detection and real-time alerts |
| Product Integrations | Prototype UI and simulation-ready backend design | Live partner APIs, wallet settlement, audit dashboards |

## Example Claim Walkthrough
Example worker: delivery partner in heavy rain window.

- Plan: Premium (Rs 35/week)
- Region: Hyderabad
- Shift window: 6 PM to 10 PM
- External context: high precipitation + traffic slowdown
- Expected deliveries: 16
- Actual deliveries: 6

Decision path:
- Disruption truth score is high (verified weather + congestion).
- Work continuity shows a significant drop consistent with disruption.
- Device and movement integrity are normal.

Outcome:
- Claim is approved through the parametric path.
- Recommended payout is adjusted by severity and plan limits.

## Risks and Mitigations

| Risk | Why It Matters | Mitigation |
|------|----------------|-----------|
| GPS spoofing | False claims can pass location checks | Multi-signal validation (trajectory, sensors, network, device trust) |
| Network drop in bad weather | Honest workers can look suspicious | Grace windows, retry logic, and soft-review instead of auto-denial |
| Coordinated fraud rings | Group abuse can evade single-user rules | Shared-signal graph checks across devices, routes, and timing |
| False positives | Legit claims delayed unnecessarily | Confidence thresholds, explainable review reasons, reversal path |
| Model drift over time | Decision quality degrades | Periodic recalibration with reviewed claim outcomes |

## Adversarial Defense & Anti-Spoofing Strategy

### 1) Differentiation Logic
The system does not make decisions from GPS alone.

Each claim is evaluated on three tracks:
- Disruption truth: whether external conditions in that region and time window were actually severe
- Work continuity: expected vs actual work pattern for that worker profile and shift
- Trust integrity: whether device/session behavior is consistent with normal usage

When these tracks align, claims can be auto-approved. When they conflict, claims are routed to review instead of immediate denial.

### 2) Data Signals Used
To detect organized spoofing and collusion, the model uses signals beyond location coordinates:
- Route quality and movement plausibility (teleport jumps, impossible speed changes)
- Sensor consistency (heading/accelerometer vs movement claims)
- Geofence context (pickup/drop clusters, no-service zones, timestamp alignment)
- Network patterns (IP/ASN switching, VPN/proxy behavior during claim windows)
- Device integrity (device continuity, emulator/root/jailbreak indicators)
- Worker baseline behavior (shift rhythm, zone transitions, completion variance)
- Ring-level graph links (shared devices, shared network signatures, synchronized claim timing)

These features are scored with anomaly detection and supervised models, with thresholding tuned for explainability.

### 3) UX and Fairness Balance
The claim flow is designed to reduce fraud without punishing legitimate workers facing poor connectivity:
- Soft-flagging: suspicious claims are marked for review, not auto-rejected
- Grace windows: temporary signal drops in severe weather are retried before escalation
- Low-friction follow-up: additional checks are requested only when confidence is low
- Manual review for edge cases: reviewers see model reasons before decisions
- Recovery path: if later telemetry supports legitimacy, payout can be released automatically

This keeps the process fair for honest workers while still resisting coordinated abuse.
