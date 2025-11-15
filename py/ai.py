# FILE: py/ai.py
# Brython-KI – Tactical AI System
from browser import window
import json, math

PY_AI_READY = False

def _dir(me, enemy):
    dx = enemy["x"] - me["x"]; dy = enemy["y"] - me["y"]
    dist = (dx*dx + dy*dy) ** 0.5
    ang = math.atan2(dy, dx)
    return dx, dy, dist, ang

def evaluate_action(action, me, enemy, dist, cds, profile):
    """Evaluate tactical score for an action"""
    score = 0
    my_hp_pct = me["hp"] / me["maxHp"]
    enemy_hp_pct = enemy["hp"] / me["maxHp"]
    in_combat_range = dist < 100
    in_attack_range = dist < 80
    is_aggressive = profile == "aggressive"
    is_defensive = profile == "defensive"

    if action == "heal":
        if cds.get("heal", 0) > 0: return -1000  # Can't use
        if me.get("en", 100) < 25: return -1000  # Not enough energy
        # Heal priority based on HP
        if my_hp_pct < 0.25: score = 1000  # Critical HP
        elif my_hp_pct < 0.40: score = 600  # Low HP
        elif my_hp_pct < 0.60: score = 300  # Medium HP
        else: score = -500  # High HP - don't waste
        # Defensive AI heals more aggressively
        if is_defensive: score *= 1.3
        # Don't heal if enemy is very close and can punish
        if in_attack_range: score -= 400

    elif action == "dash":
        if cds.get("dash", 0) > 0: return -1000  # Can't use
        # Dash to close distance
        if dist > 200: score = 400
        elif dist > 150: score = 200
        else: score = -200  # Too close for dash
        # Aggressive uses dash more
        if is_aggressive: score *= 1.5

    elif action == "spin":
        if cds.get("spin", 0) > 0: return -1000  # Can't use
        # Spin is best when enemy is very close (AoE around self)
        if dist < 60: score = 800  # Perfect range
        elif dist < 100: score = 400  # Good range
        elif dist < 140: score = 100  # Okay range
        else: score = -500  # Too far
        # Bonus if low HP (desperation move)
        if my_hp_pct < 0.3: score += 200

    elif action == "attack_heavy":
        if cds.get("heavy", 0) > 0: return -1000  # Can't use
        # Heavy is good for burst damage at medium range
        if dist < 70: score = 600  # Good range
        elif dist < 110: score = 400  # Acceptable
        else: score = -200  # Too far
        # Use heavy to finish low HP enemies
        if enemy_hp_pct < 0.3: score += 400
        # Aggressive uses heavy more
        if is_aggressive: score *= 1.3

    elif action == "attack_light":
        # Light attack is always available, safe poke
        if dist < 60: score = 500  # Close range
        elif dist < 90: score = 400  # Good range
        elif dist < 120: score = 200  # Max range
        else: score = -100  # Too far
        # Safe option for defensive
        if is_defensive: score *= 1.2

    elif action == "move_towards":
        # Approach if out of range
        if dist > 150: score = 500
        elif dist > 100: score = 300
        else: score = 50  # Already close
        # Aggressive approaches more
        if is_aggressive: score *= 1.4
        # Don't approach if low HP
        if my_hp_pct < 0.3: score -= 300

    elif action == "move_away":
        # Retreat when low HP or too close
        if my_hp_pct < 0.3: score = 600  # Low HP - retreat
        elif dist < 60: score = 400  # Too close
        elif dist < 100: score = 200  # Close
        else: score = -200  # Don't retreat if far
        # Defensive retreats more
        if is_defensive: score *= 1.5

    elif action in ["strafe_left", "strafe_right"]:
        # Strafe for repositioning at medium range
        if 80 < dist < 160: score = 300
        elif dist < 80: score = 400  # Dodge at close range
        else: score = 100
        # Defensive strafes more
        if is_defensive: score *= 1.3

    elif action == "idle":
        score = -100  # Generally don't idle

    return score

def decide_tactical(state, profile):
    """Tactical AI decision system with scoring"""
    import random
    me = state["self"]
    enemy = state.get("closestEnemy")
    if not enemy: return "idle"

    cds = state.get("cooldowns", {})
    dx, dy, dist, ang = _dir(me, enemy)

    # Evaluate all possible actions
    actions = ["heal", "dash", "spin", "attack_heavy", "attack_light",
               "move_towards", "move_away", "strafe_left", "strafe_right"]

    best_action = "idle"
    best_score = float('-inf')

    for action in actions:
        score = evaluate_action(action, me, enemy, dist, cds, profile)
        # Add small random variation (±10%) for dynamic behavior
        if score > -1000:
            score *= (0.95 + random.random() * 0.1)
        if score > best_score:
            best_score = score
            best_action = action

    return best_action

def decide_aggressive(state):
    return decide_tactical(state, "aggressive")

def decide_defensive(state):
    return decide_tactical(state, "defensive")

def decide_random(state):
    # Even "random" uses tactical evaluation, just picks randomly from top 3
    import random
    me = state["self"]
    enemy = state.get("closestEnemy")
    if not enemy: return "idle"

    cds = state.get("cooldowns", {})
    dx, dy, dist, ang = _dir(me, enemy)

    actions = ["heal", "dash", "spin", "attack_heavy", "attack_light",
               "move_towards", "move_away", "strafe_left", "strafe_right", "idle"]

    # Score all actions and pick randomly from top options
    scored = [(action, evaluate_action(action, me, enemy, dist, cds, "aggressive"))
              for action in actions]
    scored.sort(key=lambda x: x[1], reverse=True)

    # Pick randomly from top 3 valid actions
    top_actions = [a for a, s in scored[:3] if s > -1000]
    return random.choice(top_actions) if top_actions else "idle"

def PY_AI_DECIDE(profile_id, state_json):
    try:
        state = json.loads(state_json)
    except Exception:
        return "idle"
    if profile_id == "aggressive":
        return decide_aggressive(state)
    if profile_id == "defensive":
        return decide_defensive(state)
    return decide_random(state)

window.PY_AI_DECIDE = PY_AI_DECIDE
window.PY_AI_READY = True
PY_AI_READY = True
