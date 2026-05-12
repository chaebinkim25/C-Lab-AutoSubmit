import json
import os

lab = 11

data = {
    "tasks": [
        {
            "title": "Create a Custom Print Function",
            "description": "encapsulate the string printing logic into a reusable custom function",
            "skeleton_code": """
#include <stdio.h>

/* To-Do: 문자열을 전달받으면, 화면에 출력하는 함수 print를 만들어보세요 */


int main(void)
{
        print("print function ok.\\n");
        return 0;
}
"""
        },
        {
            "title": "",
            "description": "",
            "skeleton_code": """
#include <stdio.h>

/* To-Do: 0부터 9까지 범위의 정수를 전달받으면, 화면에 숫자를 출력하는 함수 print_digit을 만들어보세요 */

int main(void)
{
        print_digit(0);
        print_digit(9);
        return 0;
}
"""
        },
        {
            "title": "",
            "description": "",
            "skeleton_code": """
#include <stdio.h>

/* To-Do: 0부터 99까지 범위의 정수를 전달받으면, 화면에 각 자리수에 해당하는 숫자 두개를 출력하는 함수 print_two_digit_leading_zero를 만들어보세요. 0을 입력받으면 화면에 00 출력, 10을 입력받으면 화면에 10 출력 */

int main(void)
{
        print_two_digit_leading_zero(0);
        print_two_digit_leading_zero(9);
        print_two_digit_leading_zero(10);
        print_two_digit_leading_zero(99);
        return 0;
}
"""
        },
        {
            "title": "",
            "description": "",
            "skeleton_code": """
#include <stdio.h>

/* To-Do: 0부터 99까지 범위의 정수를 전달받으면, 화면에 정수를 그대로 출력하는 함수 print_two_digit_no_leading_zero를 만들어보세요. 0을 입력받으면 화면에 0 출력, 10을 입력받으면 화면에 10 출력 */

int main(void)
{
        print_two_digit_no_leading_zero(0);
        print_two_digit_no_leading_zero(9);
        print_two_digit_no_leading_zero(10);
        print_two_digit_no_leading_zero(99);
        return 0;
}
"""
        },
        {
            "title": "",
            "description": "",
            "skeleton_code": """
#include <stdio.h>

/* To-Do: 0부터 999까지 범위의 정수를 전달받으면, 화면에 각 자리수에 해당하는 숫자 세개를 출력하는 함수 print_three_digit_leading_zero를 만들어보세요. 0을 입력받으면 화면에 000 출력, 10을 입력받으면 화면에 010 출력, 100을 입력받으면 화면에 100 출력, 999를 입력받으면 화면에 999 출력 */

int main(void)
{
        print_three_digit_leading_zero(0);
        print_three_digit_leading_zero(9);
        print_three_digit_leading_zero(10);
        print_three_digit_leading_zero(99);
        print_three_digit_leading_zero(100);
        print_three_digit_leading_zero(999);
        return 0;
}
"""
        },
        {
            "title": "",
            "description": "",
            "skeleton_code": """
#include <stdio.h>

/* To-Do: 0부터 999까지 범위의 정수를 전달받으면, 화면에 정수를 그대로 출력하는 함수 print_three_digit_no_leading_zero를 만들어보세요. 0을 입력받으면 화면에 0 출력, 10을 입력받으면 화면에 10 출력, 100을 입력받으면 화면에 100 출력 */

int main(void)
{
        print_three_digit_no_leading_zero(0);
        print_three_digit_no_leading_zero(9);
        print_three_digit_no_leading_zero(10);
        print_three_digit_no_leading_zero(99);
        print_three_digit_no_leading_zero(100);
        print_three_digit_no_leading_zero(999);
        return 0;
}
"""
        },
        {
            "title": "",
            "description": "",
            "skeleton_code": """
#include <stdio.h>

/* To-Do: 1부터 32비트 INT_MAX까지 범위의 정수를 전달받으면, 화면에 각 자리수에 해당하는 숫자 열개를 출력하는 함수 print_ten_digit_leading_zero를 만들어보세요. */

int main(void)
{
        print_ten_digit_leading_zero(777);
        print_ten_digit_leading_zero(20260513);
        print_ten_digit_leading_zero(INT_MAX);
        return 0;
}
"""
        },
        {
            "title": "",
            "description": "",
            "skeleton_code": """
#include <stdio.h>
#include <limits.h>

/* To-Do: 1부터 INT_MAX까지 범위의 정수를 전달받으면, 화면에 정수를 그대로 출력하는 함수 print_positives를 만들어보세요. */

int main(void)
{
        print_positives(777);
        print_positives(20260513);
        print_positives(INT_MAX);
        return 0;
}
"""
        },
        {
            "title": "",
            "description": "",
            "skeleton_code": """
#include <stdio.h>
#include <limits.h>

/* To-Do: INT_MIN부터 -1까지 범위의 정수를 전달받으면, 화면에 정수를 그대로 출력하는 함수 print_negatives를 만들어보세요. */

int main(void)
{
        print_negatives(-1);
        print_negatives(INT_MIN);
        return 0;
}
"""
        },
        {
            "title": "",
            "description": "",
            "skeleton_code": """
#include <stdio.h>
#include <limits.h>

/* To-Do: INT_MIN부터 INT_MAX까지 범위의 정수를 전달받으면, 화면에 정수를 그대로 출력하는 함수 print_int를 만들어보세요. */

int main(void)
{
        print_int(INT_MAX);
        print_int(INT_MIN);
        print_int(0);
        return 0;
}
"""
        },
        {
            "title": "",
            "description": "",
            "skeleton_code": """
#include <stdio.h>
#include <limits.h>

/* To-Do: int 배열을 전달받으면, 화면에 배열 내용을 출력하는 함수 print_int_array를 만들어보세요. */

int main(void)
{
        int arr1[] = {0};
        int arr2[] = {1, 2};
        int arr3[] = {3, 4, 5};
        print_int_array(arr1);
        print_int_array(arr2);
        print_int_array(arr3);        
        return 0;
}
"""
        },
        {
            "title": "",
            "description": "",
            "skeleton_code": """
#include <stdio.h>
#include <limits.h>

/* To-Do: 숫자 배열과 목표값을 전달받으면, 합계가 목표값이 되는 두 숫자를 찾는 twoSum 함수를 만들어보세요. */
/* 반환값: 성공했을 때 0, 실패했을 때 -1 */
/* nums: 숫자들이 저장된 배열 */
/* numsSize: nums 배열의 크기 */
/* target: 두 숫자 합계 목표 */
/* first_num_index: 합계가 target인 두 숫자 중 첫번째 숫자의 인덱스 */
/* second_num_index: 합계가 target인 두 숫자 중 두번째 숫자의 인덱스 */
int twoSum(int *nums, int numsSize, int target, int *first_num_index, int *second_num_index);

int main(void)
{
        int nums[5] = {1, 2, 3, 4, 5};
        int numsSize = 5;
        int target = 3;
        int index_found[2] = {-1, -1};

        print_str("nums: ");
        print_int_array(nums, 5);
        print_str("\n");
        
        print_str("target: ");
        print_int(target);
        print_str("\n");

        int result = twoSum(nums, numsSize, target, &index_found[0], &index_found[1]);

        print_str("result: ");
        if (result == 0) {
                print_str("success");
        } else {
                print_str("fail");
        }
        print_str("\n");

        print_str("index found: ");
        print_int_array(result, 2);
        print_str("\n");
        
        return 0;
}
"""
        },
        {
            "title": "",
            "description": "",
            "skeleton_code": """
#include <stdio.h>
#include <limits.h>

/* To-Do: 0부터 255까지의 숫자를 전달받으면, 화면에 이진수로 변환해서 비트 여덟개를 출력하는 함수 print_binary를 만들어보세요. */

int main(void)
{
        for (int i = 0; i <= 255; i++) {
                print_int(i);
                print_str(": ");
                print_binary(i);
                print_str("\n);
        }
        return 0;
}
"""
        },
        {
            "title": "",
            "description": "",
            "skeleton_code": """
#include <stdio.h>
#include <limits.h>

/* To-Do: 글자 '0'과 '1' 여덟개로 이뤄진 문장을 전달받으면, 이진수를 십진수로 변환해서 반환하는 함수 decode_binary를 만들어보세요. */

int main(void)
{
        unsigned char x = decode_bit("00001010");
        unsigned char y = decode_bit("11010011");
        
        print_str("x: ");
        print_binary(x);
        print_str("\n");

        print_str("y: ");
        print_binary(y);
        print_str("\n");

        print_str("x & y: ");
        print_binary(x & y);
        print_str("\n");

        print_str("x | y: ");
        print_binary(x | y);
        print_str("\n");

        print_str("x ^ y: ");
        print_binary(x ^ y);
        print_str("\n");

        print_str("(x ^ y) ^ y: ");
        print_binary((x ^ y) ^ y);
        print_str("\n");

        return 0;
}
"""
        },
        {
            "title": "",
            "description": "",
            "skeleton_code": """
#include <stdio.h>
#include <limits.h>

/* To-Do: encrypted_msg에 저장된 암호를 해독해서 화면에 출력해보세요. */

int main(void)
{
        const char encrypted_msg[] = "dzcfs tfdvsjuz";
        char decrypted_msg[30] = "dzcfs tfdvsjuz";

        print_str(decrypted_msg);
        print_str("\n");
        
        return 0;
}
"""
        },
]
}

# 0. add task id
for index, task in enumerate(data.get("tasks", [])):
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
