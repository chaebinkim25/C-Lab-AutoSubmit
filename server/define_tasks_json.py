import json
import os

lab = 6

data = {
    "tasks": [
        {
            "title": "Simple Addition",
            "description": "return the sum of the two parameters",
            "skeleton_code": """

/* add 함수는 매개 변수 두개를 더한 값을 반환한다. 
 *
 * 매개변수:
 *      - int a: 더할 한 숫자
 *      - int b: 더할 다른 숫자
 *
 * 반환값: a와 b를 더한 결과
 */

int add(int a, int b);

/* to_do: 두 숫자를 더하는 add 함수를 만들어보세요 */

int main(void)
{
        int result = add(3, 5);
        return 0;
}
"""
        },
        {
            "title": "Overflow-safe Addition",
            "description": "return the sum of the two positive-integer parameters only if the result is not overflowed",
            "skeleton_code": """

/* add_positives_overflow_safe 함수는 덧셈을 하기 전에 먼저 오버플로우를 체크한다.
 * 문제가 없다는 것이 확인된 경우에만 매개 변수 두개를 더한 값을 반환한다. 
 *
 * 매개변수:
 *      - int a: 더할 한 양의 숫자
 *      - int b: 더할 다른 양의 숫자
 *      - int int_max: 오버플로우되지 않는 범위 안에서의 최대값
 *
 * 반환값: 
 *      - 문제가 없을 경우      : a + b
 *      - a나 b가 음수일 경우   : -1        : 
 *      - a나 b가 너무 클 경우  : -2
 *      - a + b가 너무 클 경우  : -3
 */

int add_positives_overflow_safe(int a, int b, int int_max);

/* to_do: 두 양수를 안전하게 더하는 add_positives_overflow_safe 함수를 만들어보세요 */

int main(void)
{
        int int_max = 32767;            /* int_max: 16비트 기준 최대값 */

        int result_neg = positive_add_overflow_safe(0, -1, int_max);
        int result_big = positive_add_overflow_safe(0, int_max + 1, int_max);   /* int가 int_max + 1도 표현 가능하다고 가정 */
        int result_overflow = positive_add_overflow_safe(1, int_max, int_max);

        int result_normal = positive_add_overflow_safe(1, 1, int_max);

        return 0;
}
"""
        },
        {
            "title": "Simple Multiplication",
            "description": "return the multiply of the two parameters",
            "skeleton_code": """

/* multiply 함수는 매개 변수 두개를 곱한 값을 반환한다. 
 *
 * 매개변수:
 *      - int a: 더할 한 숫자
 *      - int b: 더할 다른 숫자
 *
 * 반환값: a와 b를 곱한 결과
 */

int multiply(int a, int b);

/* to_do: 두 숫자를 곱하는 multiply 함수를 만들어보세요 */

int main(void)
{
        int result = multiply(3, 5);
        return 0;
}
"""
        },
        {
            "title": "Modulo Multiplication",
            "description": "return the modular multiply of the two integers",
            "skeleton_code": """

/* multiply_modulo 함수는 곱셈을 하기 전에 먼저 나머지 연산으로 범위를 한정시킨다.
 * 곱셈한 결과에도 나머지 연산으로 범위를 한정시킨 후에 반환한다. 
 *
 * 매개변수:
 *      - int a: 곱할 한 숫자
 *      - int b: 곱할 다른 숫자
 *      - int mod: 나머지 연산을 할 때, 나누는 수. 절대값이 sqrt(int_max) + 1 이하여야 안전하다.
 *
 * 반환값: ((a % mod) * (b % mod)) % mod
 */

int multiply_modulo(int a, int b, int mod);

/* to_do: 곱셈을 할 때 나머지 연산을 써서 범위를 한정시키는 multiply_modulo 함수를 만들어보세요 */

int main(void)
{
        int mod = 10;            /* 10으로 나눈 나머지는 언제나 한자리 수 */

        int result_pos_pos = multiply_modulo(555, 555, mod);
        int result_pos_neg = multiply_modulo(555, -555, mod);
        int result_neg_neg = multiply_modulo(-555, -555, mod);

        return 0;
}
"""
        },
        {
            "title": "Modulo Multiplication by Addition",
            "description": "return the modular multiply of the two integers, implemented by addition",
            "skeleton_code": """

/* multiply_modulo_by_addition 함수는 곱셈을 하기 전에 먼저 나머지 연산으로 범위를 한정시킨다.
 * 여러번 덧셈하는 방법으로 곱셈을 구현해서 사용 가능한 mod값의 범위를 넓힌다. 
 * 덧셈을 할 때마다 나머지 연산으로 범위를 한정시킨다. 
 *
 * 매개변수:
 *      - int a: 곱할 한 양의 숫자
 *      - int b: 곱할 다른 양의 숫자
 *      - int mod: 나머지 연산을 할 때, 나누는 수. 절대값이 (int_max / 2) + 1 이하여야 안전하다.
 *
 * 반환값: (0에 (a % mod)를 (b % mod)번 더하기) % mod
 */

int multiply_modulo_by_addition(int a, int b, int mod);

/* to_do: 곱셈을 덧셈으로 구현한 multiply_modulo_by_addition 함수를 만들어보세요 */

int main(void)
{
        int mod = 10;            /* 10으로 나눈 나머지는 언제나 한자리 수 */

        int result_pos_pos = multiply_modulo(555, 555, mod);
        int result_pos_neg = multiply_modulo(555, -555, mod);
        int result_neg_neg = multiply_modulo(-555, -555, mod);

        return 0;
}
"""
        },
        {
            "title": "Power Modulo",
            "description": "return the power of an integer, to the other integer",
            "skeleton_code": """

            
/* multiply_modulo 함수는 곱셈을 하기 전에 먼저 나머지 연산으로 범위를 한정시킨다.
 * 곱셈한 결과에도 나머지 연산으로 범위를 한정시킨 후에 반환한다. 
 *
 * 매개변수:
 *      - int a: 곱할 한 양의 숫자
 *      - int b: 곱할 다른 양의 숫자
 *      - int mod: 나머지 연산을 할 때, 나누는 수. 절대값이 sqrt(int_max) + 1 이하여야 안전하다.
 *
 * 반환값: ((a % mod) * (b % mod)) % mod
 */

int multiply_modulo(int a, int b, int mod);

/* to_do: 곱셈을 할 때 나머지 연산을 써서 범위를 한정시키는 multiply_modulo 함수를 만들어보세요 */


/* power_modulo 함수는 먼저 나머지 연산으로 범위를 한정되는 곱셈을 반복해서 거듭제곱을 구한다.
 *
 * 매개변수:
 *      - int a: 거듭제곱에서 밑에 해당하는 양의 숫자
 *      - int b: 거듭제곱에서 지수에 해당하는 양의 숫자
 *      - int mod: 나머지 연산을 할 때, 나누는 수. 절대값이 sqrt(int_max) + 1 이하여야 안전하다.
 *
 * 반환값: (1에 (a % mod)를 b번 곱하기) % mod
 */

int power_modulo(int a, int b, int mod);

/* to_do: 거듭제곱을 곱셈으로 구현한 power_modulo 함수를 만들어보세요 */

int main(void)
{
        int mod = 10;            /* 10으로 나눈 나머지는 언제나 한자리 수 */

        int result_3_to_100 = power_modulo(3, 100, mod);

        return 0;
}
"""
        },
        {
            "title": "Fibonacci by recursion",
            "description": "calculate fibonacci number by recursion",
            "skeleton_code": """

/* fibonacci 함수는 피보나치 숫자를 재귀적으로 계산한다. 
 *
 * 매개변수:
 *      - int n: 몇번째 피보나치 숫자를 구할지
 *
 * 반환값: 
 *      - n이 0이면, 0
 *      - n이 1이면, 1
 *      - n이 2이상 이면, f(n - 1) + f(n - 2)
 */

int fibonacci(int n);

/* to_do: n번째 두 숫자를 더하는 add 함수를 만들어보세요 */

int main(void)
{
        int result = fibonacci(10);
        return 0;
}
"""
        },        
    ]
}

# 0. add task id
for index, task in enumerate(data["tasks"]):
    task["task_id"] = f"lab{lab}_part{index}"
    task["title"] = f"Part {index}: " + task["title"]

# 1. Get the absolute path of the directory this script is in (.../scripts/)
script_dir = os.path.dirname(os.path.abspath(__file__))

# 2. Navigate up one level, then into the 'server' folder
server_dir = os.path.join(script_dir, '..', 'server')

# 3. Create the 'server' directory if it doesn't exist yet! (This prevents the error)
os.makedirs(server_dir, exist_ok=True)

# 4. Define the final path to the JSON file
file_path = os.path.join(server_dir, 'tasks.json')

# 5. Save the file
with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=4, ensure_ascii=False)

print()
print("tasks.json has been created!")
